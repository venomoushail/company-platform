"use client";

import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bold,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MapPin,
  MessageSquareText,
  Palette,
  PencilLine,
  Pilcrow,
  Plus,
} from "lucide-react";
import Image from "next/image";
import type {
  ContentBlockConfig,
  ImageHotspotConfig,
  KnowledgeCheckConfig,
  LearningBlockAnswer,
  LearningBlockConfig,
  LearningBlockType,
  RecapBlockConfig,
  ReflectionBlockConfig,
  ScenarioBlockConfig,
} from "@/types/learningBlocks";
import {
  getDefaultLearningBlockConfig,
  isPersistentImageUrl,
  normalizeLearningBlockConfig,
  normalizeLearningBlockType,
  regenerateLearningBlockConfigIds,
} from "@/types/learningBlocks";

export type Slide = {
  id: number;
  title: string;
  body: string;
  slide_type: LearningBlockType;
  config_json: LearningBlockConfig;
  media?: SlideMedia;
  isComplete: boolean;
};

export type SlideMedia = {
  type: "image";
  url: string;
  alt?: string;
  fileName?: string;
  storagePath?: string;
  isLocalPreview?: boolean;
};

type SlideBuilderProps = {
  slides: Slide[];
  setSlides: Dispatch<SetStateAction<Slide[]>>;
  selectedSlideId: number;
  setSelectedSlideId: (id: number) => void;
  onFocusBuilder?: () => void;
  onUploadImage: (file: File, slideId: number) => Promise<{
    url: string;
    storagePath: string;
  }>;
  onImageUploadStateChange?: (slideId: number, isUploading: boolean) => void;
};

type SortableSlideButtonProps = {
  slide: Slide;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
};

type BodyFormatAction =
  | "bold"
  | "italic"
  | "heading"
  | "bullet-list"
  | "numbered-list"
  | "paragraph";

type BodyTextColor =
  | "default"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "gray"
  | "black";

const bodyFormatButtons = [
  {
    action: "bold",
    label: "Bold",
    icon: Bold,
  },
  {
    action: "italic",
    label: "Italic",
    icon: Italic,
  },
  {
    action: "heading",
    label: "Heading",
    icon: Heading2,
  },
  {
    action: "bullet-list",
    label: "Bullet list",
    icon: List,
  },
  {
    action: "numbered-list",
    label: "Numbered list",
    icon: ListOrdered,
  },
  {
    action: "paragraph",
    label: "Paragraph break",
    icon: Pilcrow,
  },
] satisfies {
  action: BodyFormatAction;
  label: string;
  icon: typeof Bold;
}[];

const bodyTextColorOptions = [
  {
    value: "default",
    label: "Default",
  },
  {
    value: "blue",
    label: "Blue",
  },
  {
    value: "green",
    label: "Green",
  },
  {
    value: "red",
    label: "Red",
  },
  {
    value: "orange",
    label: "Orange",
  },
  {
    value: "gray",
    label: "Gray",
  },
  {
    value: "black",
    label: "Black",
  },
] satisfies {
  value: BodyTextColor;
  label: string;
}[];

const learningBlockTemplates = [
  {
    type: "content",
    label: "Content",
    icon: BookOpen,
    title: "Content",
    body: "<p>Introduce the key idea, procedure, or policy learners need to understand.</p>",
    description: "Teach with text, images, headings, and lists.",
    isInteractive: false,
  },
  {
    type: "knowledge_check",
    label: "Knowledge Check",
    icon: CircleHelp,
    title: "Knowledge Check",
    body: "",
    description: "Ask an ungraded question and explain the correct answer.",
    isInteractive: true,
  },
  {
    type: "image_hotspot",
    label: "Image Hotspot",
    icon: MapPin,
    title: "Image Hotspot",
    body: "",
    description: "Let learners explore labeled points on an image.",
    isInteractive: true,
  },
  {
    type: "scenario",
    label: "Scenario",
    icon: MessageSquareText,
    title: "Scenario",
    body: "",
    description: "Present a realistic situation and let learners choose a response.",
    isInteractive: true,
  },
  {
    type: "reflection",
    label: "Reflection",
    icon: PencilLine,
    title: "Reflection",
    body: "",
    description: "Ask learners to think or write about a concept.",
    isInteractive: true,
  },
  {
    type: "recap",
    label: "Recap",
    icon: CheckCircle2,
    title: "Recap",
    body: "",
    description: "Summarize key points before continuing.",
    isInteractive: false,
  },
] satisfies {
  type: LearningBlockType;
  label: string;
  icon: typeof BookOpen;
  title: string;
  body: string;
  description: string;
  isInteractive: boolean;
}[];

const inlineMarkupPattern =
  /(\[color=(blue|green|red|orange|gray|black)\][\s\S]+?\[\/color\]|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;

const maxSlideImageSizeBytes = 5 * 1024 * 1024;
const acceptedSlideImageTypes = ["image/jpeg", "image/png", "image/webp"];

function getLearningBlockTemplate(type: LearningBlockType) {
  return (
    learningBlockTemplates.find((template) => template.type === type) ??
    learningBlockTemplates[0]
  );
}

const editorTextColorClasses: Record<Exclude<BodyTextColor, "default">, string> = {
  blue: "text-blue-700",
  green: "text-green-700",
  red: "text-red-700",
  orange: "text-orange-700",
  gray: "text-slate-600",
  black: "text-slate-950",
};

const rgbToTextColor: Record<string, Exclude<BodyTextColor, "default">> = {
  "rgb(29, 78, 216)": "blue",
  "#1d4ed8": "blue",
  "rgb(21, 128, 61)": "green",
  "#15803d": "green",
  "rgb(185, 28, 28)": "red",
  "#b91c1c": "red",
  "rgb(194, 65, 12)": "orange",
  "#c2410c": "orange",
  "rgb(71, 85, 105)": "gray",
  "#475569": "gray",
  "rgb(2, 6, 23)": "black",
  "#020617": "black",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkupToHtml(text: string): string {
  let html = "";
  let lastIndex = 0;

  text.replace(inlineMarkupPattern, (match, _group, _color, offset: number) => {
    if (offset > lastIndex) {
      html += escapeHtml(text.slice(lastIndex, offset));
    }

    if (match.startsWith("[color=")) {
      const colorMatch = match.match(
        /^\[color=(blue|green|red|orange|gray|black)\]([\s\S]+)\[\/color\]$/
      );

      if (colorMatch) {
        const textColor = colorMatch[1] as Exclude<BodyTextColor, "default">;
        html += `<span data-color="${textColor}" class="${editorTextColorClasses[textColor]}">${inlineMarkupToHtml(
          colorMatch[2]
        )}</span>`;
      } else {
        html += escapeHtml(match);
      }
    } else if (
      (match.startsWith("**") && match.endsWith("**")) ||
      (match.startsWith("__") && match.endsWith("__"))
    ) {
      html += `<strong>${inlineMarkupToHtml(match.slice(2, -2))}</strong>`;
    } else {
      html += `<em>${inlineMarkupToHtml(match.slice(1, -1))}</em>`;
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    html += escapeHtml(text.slice(lastIndex));
  }

  return html;
}

function lessonBodyToEditorHtml(body: string) {
  if (looksLikeLessonHtml(body)) {
    return sanitizeLessonBodyHtml(body);
  }

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;

    const firstLine = paragraphLines[0];
    const headingMatch =
      paragraphLines.length === 1 ? firstLine.match(/^\s{0,3}#{1,3}\s+(.+)$/) : null;

    if (headingMatch) {
      blocks.push(`<h3>${inlineMarkupToHtml(headingMatch[1])}</h3>`);
    } else {
      blocks.push(`<p>${paragraphLines.map(inlineMarkupToHtml).join("<br>")}</p>`);
    }

    paragraphLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      blocks.push("<p><br></p>");
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      flushParagraph();

      const listTag = unorderedMatch ? "ul" : "ol";
      const listPattern = unorderedMatch ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
      const items = [`<li>${inlineMarkupToHtml(line.match(listPattern)?.[1] ?? "")}</li>`];

      while (index + 1 < lines.length && listPattern.test(lines[index + 1])) {
        index += 1;
        items.push(`<li>${inlineMarkupToHtml(lines[index].match(listPattern)?.[1] ?? "")}</li>`);
      }

      blocks.push(`<${listTag}>${items.join("")}</${listTag}>`);
      continue;
    }

    paragraphLines.push(trimmedLine);
  }

  flushParagraph();

  return blocks.join("") || "<p><br></p>";
}

function isBlankEditorBlock(text: string) {
  return text.replace(/\u00a0/g, " ").trim().length === 0;
}

function looksLikeLessonHtml(body: string) {
  return /<\/?(p|h[1-6]|ul|ol|li|strong|b|em|i|span|br)(\s[^>]*)?>/i.test(body);
}

function sanitizeLessonBodyHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeLessonNode(template.content);

  return template.innerHTML;
}

function sanitizeLessonNode(parent: ParentNode) {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (!(node instanceof HTMLElement)) {
      node.parentNode?.removeChild(node);
      return;
    }

    const tagName = node.tagName.toLowerCase();
    const allowedTagName = normalizeLessonTagName(tagName);

    if (!allowedTagName) {
      const nodeParent = node.parentNode;
      if (!nodeParent) return;

      while (node.firstChild) {
        nodeParent.insertBefore(node.firstChild, node);
      }

      nodeParent.removeChild(node);
      sanitizeLessonNode(nodeParent);
      return;
    }

    if (allowedTagName !== tagName) {
      const replacement = document.createElement(allowedTagName);

      while (node.firstChild) {
        replacement.appendChild(node.firstChild);
      }

      node.parentNode?.replaceChild(replacement, node);
      sanitizeLessonElement(replacement);
      sanitizeLessonNode(replacement);
      return;
    }

    sanitizeLessonElement(node);
    sanitizeLessonNode(node);
  });
}

function normalizeLessonTagName(tagName: string) {
  if (["p", "br", "h3", "strong", "em", "span", "ul", "ol", "li"].includes(tagName)) {
    return tagName;
  }

  if (tagName === "b") return "strong";
  if (tagName === "i") return "em";
  if (/^h[1-6]$/.test(tagName)) return "h3";

  return null;
}

function sanitizeLessonElement(element: HTMLElement) {
  const textColor = getNodeTextColor(element);

  Array.from(element.attributes).forEach((attribute) => {
    element.removeAttribute(attribute.name);
  });

  if (element.tagName === "SPAN" && textColor) {
    element.dataset.color = textColor;
    element.className = editorTextColorClasses[textColor];
  }
}

function serializeInlineNodeAsHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.tagName === "BR") {
    return "<br>";
  }

  const childrenHtml = Array.from(node.childNodes)
    .map(serializeInlineNodeAsHtml)
    .join("");
  const textColor = getNodeTextColor(node);

  if (node.tagName === "STRONG" || node.tagName === "B") {
    return `<strong>${childrenHtml}</strong>`;
  }

  if (node.tagName === "EM" || node.tagName === "I") {
    return `<em>${childrenHtml}</em>`;
  }

  if (textColor) {
    return `<span data-color="${textColor}" class="${editorTextColorClasses[textColor]}">${childrenHtml}</span>`;
  }

  return childrenHtml;
}

function getNodeTextColor(node: HTMLElement): Exclude<BodyTextColor, "default"> | null {
  const colorAttribute = node.dataset.color as BodyTextColor | undefined;

  if (
    colorAttribute &&
    colorAttribute !== "default" &&
    colorAttribute in editorTextColorClasses
  ) {
    return colorAttribute;
  }

  const styleColor = node.style.color;
  const htmlColorAttribute = node.getAttribute("color");

  return rgbToTextColor[styleColor] ?? rgbToTextColor[htmlColorAttribute ?? ""] ?? null;
}

function serializeEditorBlockAsHtml(element: HTMLElement): string {
  if (element.tagName === "UL" || element.tagName === "OL") {
    const listTag = element.tagName.toLowerCase();
    const items = Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => {
        const itemHtml = Array.from(child.childNodes)
          .map(serializeInlineNodeAsHtml)
          .join("")
          .trim();

        return itemHtml ? `<li>${itemHtml}</li>` : "";
      })
      .filter(Boolean);

    return items.length > 0 ? `<${listTag}>${items.join("")}</${listTag}>` : "";
  }

  const inlineHtml = Array.from(element.childNodes)
    .map(serializeInlineNodeAsHtml)
    .join("");
  const normalizedText = element.textContent ?? "";

  if (isBlankEditorBlock(normalizedText)) {
    return "<p><br></p>";
  }

  if (/^H[1-6]$/.test(element.tagName)) {
    return `<h3>${inlineHtml}</h3>`;
  }

  return `<p>${inlineHtml}</p>`;
}

function stripEditorColorWrappers(root: ParentNode) {
  Array.from(
    root.querySelectorAll("span[data-color], font[color], span[style], font[style]")
  ).forEach((element) => {
    if (!(element instanceof HTMLElement) || !getNodeTextColor(element)) return;

    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
  });
}

function editorHtmlToLessonBody(editor: HTMLElement) {
  const html = Array.from(editor.childNodes)
    .map((child) => {
      if (child instanceof HTMLElement) {
        return serializeEditorBlockAsHtml(child);
      }

      const inlineHtml = serializeInlineNodeAsHtml(child).trim();
      return inlineHtml ? `<p>${inlineHtml}</p>` : "";
    })
    .filter(Boolean)
    .join("")
    .trim();

  return sanitizeLessonBodyHtml(html);
}

function lessonBodyToPlainText(body: string) {
  return body
    .replace(/<li(?:\s[^>]*)?>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(p|h[1-6]|ul|ol|strong|b|em|i|span)(?:\s[^>]*)?>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\[color=(blue|green|red|orange|gray|black)\]([\s\S]*?)\[\/color\]/g, "$2")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s{0,3}#{1,3}\s+/gm, "")
    .replace(/^\s*([-*]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function SortableSlideButton({
  slide,
  index,
  isSelected,
  onSelect,
}: SortableSlideButtonProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const plainBody = lessonBodyToPlainText(slide.body);
  const wordCount = plainBody
    ? plainBody.split(/\s+/).length
    : 0;
  const blockTemplate = getLearningBlockTemplate(slide.slide_type);
  const BlockIcon = blockTemplate.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "opacity-60" : ""}`}
    >
      <div
        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
          isSelected
            ? "border-blue-600 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className={`mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-xs font-bold active:cursor-grabbing ${
              isSelected
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500"
            }`}
            title="Drag to reorder"
            aria-label="Drag to reorder slide"
          >
            ☰
          </button>

          <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                onSelect();
              }
            }}
            className="min-w-0 flex-1 cursor-pointer rounded-md"
          >
            <p className="truncate font-semibold">
              {index + 1}. {slide.title || "Untitled Slide"}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <BlockIcon size={13} strokeWidth={2.4} aria-hidden="true" />
              {blockTemplate.label}
            </p>

            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {plainBody || "No content added yet."}
            </p>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </p>

              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  slide.isComplete
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {slide.isComplete ? "Ready" : "Incomplete"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SlideBuilder({
  slides,
  setSlides,
  selectedSlideId,
  setSelectedSlideId,
  onFocusBuilder,
  onUploadImage,
  onImageUploadStateChange,
}: SlideBuilderProps) {
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [selectedBodyColor, setSelectedBodyColor] =
    useState<BodyTextColor>("default");
  const [imageError, setImageError] = useState("");
  const [uploadingImageSlideIds, setUploadingImageSlideIds] = useState<Set<number>>(
    () => new Set()
  );
  const bodyEditorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const bodySelectionRef = useRef<Range | null>(null);
  const localImageUrlsRef = useRef(new Set<string>());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const selectedSlide =
    slides.find((slide) => slide.id === selectedSlideId) ?? slides[0];

  const selectedSlideIndex = slides.findIndex(
    (slide) => slide.id === selectedSlide.id
  );

  useEffect(() => {
    const editor = bodyEditorRef.current;
    if (!editor || document.activeElement === editor) return;

    editor.innerHTML = selectedSlide.body.trim()
      ? lessonBodyToEditorHtml(selectedSlide.body)
      : "";
  }, [selectedSlide.body, selectedSlide.id]);

  useEffect(() => {
    const localImageUrls = localImageUrlsRef.current;

    return () => {
      localImageUrls.forEach((url) => URL.revokeObjectURL(url));
      localImageUrls.clear();
    };
  }, []);

  function addLearningBlock(blockType: LearningBlockType) {
    const template = getLearningBlockTemplate(blockType);

    const newSlide: Slide = {
      id: Math.max(0, ...slides.map((slide) => slide.id)) + 1,
      title: template.title,
      body: template.body,
      slide_type: template.type,
      config_json: getDefaultLearningBlockConfig(template.type),
      isComplete: false,
    };
    const insertIndex =
      selectedSlideIndex >= 0 ? selectedSlideIndex + 1 : slides.length;
    const updatedSlides = [...slides];

    updatedSlides.splice(insertIndex, 0, newSlide);
    setSlides(updatedSlides);
    setSelectedSlideId(newSlide.id);
    setIsBlockMenuOpen(false);
  }

  function updateSlide(id: number, field: "title" | "body", value: string) {
    setSlides(
      slides.map((slide) =>
        slide.id === id ? { ...slide, [field]: value } : slide
      )
    );
  }

  function updateSelectedSlideConfig(config: LearningBlockConfig) {
    setSlides((currentSlides) =>
      currentSlides.map((slide) =>
        slide.id === selectedSlide.id ? { ...slide, config_json: config } : slide
      )
    );
  }

  function updateSlideBody(id: number, value: string) {
    updateSlide(id, "body", value);
  }

  function updateSlideMedia(id: number, media?: SlideMedia) {
    setSlides((currentSlides) =>
      currentSlides.map((slide) => {
        if (slide.id !== id) return slide;

        if (slide.slide_type !== "image_hotspot") return { ...slide, media };

        const config = normalizeLearningBlockConfig(
          "image_hotspot",
          slide.config_json
        ) as ImageHotspotConfig;

        return {
          ...slide,
          media,
          config_json: {
            ...config,
            imageUrl: media?.url ?? "",
            requiresAdminSetup: !media || media.isLocalPreview === true,
          },
        };
      })
    );
  }

  function canRevokeLocalImageUrl(url: string, slideId: number) {
    return !slides.some(
      (slide) => slide.id !== slideId && slide.media?.url === url
    );
  }

  function clearImageInput() {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  async function handleSlideImageChange(file: File | undefined) {
    setImageError("");

    if (!file) return;

    if (!acceptedSlideImageTypes.includes(file.type)) {
      setImageError("Use a JPG, PNG, or WebP image.");
      clearImageInput();
      return;
    }

    if (file.size > maxSlideImageSizeBytes) {
      setImageError("Images must be 5MB or smaller.");
      clearImageInput();
      return;
    }

    const previousUrl = selectedSlide.media?.url;

    // TODO: When Supabase Storage is configured, upload this file to a lesson
    // images bucket here and store the returned public URL or storage path.
    const imageUrl = URL.createObjectURL(file);
    localImageUrlsRef.current.add(imageUrl);

    updateSlideMedia(selectedSlide.id, {
      type: "image",
      url: imageUrl,
      alt: selectedSlide.title ? `${selectedSlide.title} image` : "Lesson slide image",
      fileName: file.name,
      isLocalPreview: true,
    });

    onImageUploadStateChange?.(selectedSlide.id, true);
    setUploadingImageSlideIds((current) => new Set(current).add(selectedSlide.id));

    try {
      const uploadedImage = await onUploadImage(file, selectedSlide.id);

      setSlides((currentSlides) =>
        currentSlides.map((slide) => {
          if (slide.id !== selectedSlide.id) return slide;

          const media: SlideMedia = {
            type: "image",
            url: uploadedImage.url,
            storagePath: uploadedImage.storagePath,
            fileName: file.name,
            alt:
              slide.media?.alt ||
              (slide.title ? `${slide.title} image` : "Lesson slide image"),
          };

          if (slide.slide_type !== "image_hotspot") return { ...slide, media };

          const config = normalizeLearningBlockConfig(
            "image_hotspot",
            slide.config_json
          ) as ImageHotspotConfig;

          return {
            ...slide,
            media,
            config_json: {
              ...config,
              imageUrl: uploadedImage.url,
              requiresAdminSetup: false,
            },
          };
        })
      );
      setImageError("");

      requestAnimationFrame(() => {
        URL.revokeObjectURL(imageUrl);
        localImageUrlsRef.current.delete(imageUrl);
      });
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to upload the image. Please try again."
      );
    } finally {
      onImageUploadStateChange?.(selectedSlide.id, false);
      setUploadingImageSlideIds((current) => {
        const next = new Set(current);
        next.delete(selectedSlide.id);
        return next;
      });
    }

    if (
      previousUrl &&
      localImageUrlsRef.current.has(previousUrl) &&
      canRevokeLocalImageUrl(previousUrl, selectedSlide.id)
    ) {
      URL.revokeObjectURL(previousUrl);
      localImageUrlsRef.current.delete(previousUrl);
    }

    clearImageInput();
  }

  function removeSlideImage() {
    const previousUrl = selectedSlide.media?.url;

    updateSlideMedia(selectedSlide.id);
    setImageError("");
    clearImageInput();

    if (
      previousUrl &&
      localImageUrlsRef.current.has(previousUrl) &&
      canRevokeLocalImageUrl(previousUrl, selectedSlide.id)
    ) {
      URL.revokeObjectURL(previousUrl);
      localImageUrlsRef.current.delete(previousUrl);
    }
  }

  function updateBodySelection() {
    const editor = bodyEditorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (
      editor.contains(range.commonAncestorContainer) ||
      editor === range.commonAncestorContainer
    ) {
      bodySelectionRef.current = range.cloneRange();
    }
  }

  function restoreBodySelection() {
    const editor = bodyEditorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection) return;

    editor.focus();

    if (bodySelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(bodySelectionRef.current);
    }
  }

  function syncEditorBody() {
    const editor = bodyEditorRef.current;
    if (!editor) return;

    const nextBody = editorHtmlToLessonBody(editor);
    updateSlideBody(selectedSlide.id, nextBody);
  }

  function applyBodyFormat(action: BodyFormatAction) {
    restoreBodySelection();

    if (action === "bold") {
      document.execCommand("bold");
    } else if (action === "italic") {
      document.execCommand("italic");
    } else if (action === "heading") {
      document.execCommand("formatBlock", false, "h3");
    } else if (action === "bullet-list") {
      document.execCommand("insertUnorderedList");
    } else if (action === "numbered-list") {
      document.execCommand("insertOrderedList");
    } else if (action === "paragraph") {
      document.execCommand("insertHTML", false, "<p><br></p>");
    }

    syncEditorBody();
    updateBodySelection();
  }

  function applyBodyColor(color: BodyTextColor) {
    restoreBodySelection();

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedFragment = range.extractContents();

    stripEditorColorWrappers(selectedFragment);

    let insertedNode: Node;

    if (color === "default") {
      insertedNode = selectedFragment;
    } else {
      const colorWrapper = document.createElement("span");
      colorWrapper.dataset.color = color;
      colorWrapper.className = editorTextColorClasses[color];

      if (selectedFragment.childNodes.length > 0) {
        colorWrapper.appendChild(selectedFragment);
      } else {
        colorWrapper.textContent = "colored text";
      }

      insertedNode = colorWrapper;
    }

    range.insertNode(insertedNode);
    selection.removeAllRanges();

    const nextRange = document.createRange();

    if (insertedNode instanceof DocumentFragment) {
      nextRange.selectNodeContents(bodyEditorRef.current ?? document.body);
      nextRange.collapse(false);
    } else {
      nextRange.selectNodeContents(insertedNode);
    }

    selection.addRange(nextRange);
    setSelectedBodyColor(color);

    syncEditorBody();
    updateBodySelection();
  }

  function toggleSlideComplete(id: number) {
    setSlides(
      slides.map((slide) =>
        slide.id === id
          ? { ...slide, isComplete: !slide.isComplete }
          : slide
      )
    );
  }

  function deleteSlide(id: number) {
    if (slides.length === 1) return;

    const slideIndex = slides.findIndex((slide) => slide.id === id);
    const updatedSlides = slides.filter((slide) => slide.id !== id);

    setSlides(updatedSlides);

    if (selectedSlideId === id) {
      const nextSlide =
        updatedSlides[slideIndex] ?? updatedSlides[slideIndex - 1];

      setSelectedSlideId(nextSlide.id);
    }
  }

  function duplicateSlide(id: number) {
    const slideToCopy = slides.find((slide) => slide.id === id);
    if (!slideToCopy) return;

    const hasPersistentImage = isPersistentImageUrl(slideToCopy.media?.url);
    const copiedConfig = regenerateLearningBlockConfigIds(
      slideToCopy.slide_type,
      slideToCopy.config_json
    );
    const copiedSlide: Slide = {
      ...slideToCopy,
      id: Math.max(0, ...slides.map((slide) => slide.id)) + 1,
      title: slideToCopy.title
        ? `${slideToCopy.title} Copy`
        : "Untitled Slide Copy",
      config_json:
        slideToCopy.slide_type === "image_hotspot" && !hasPersistentImage
          ? {
              ...(copiedConfig as ImageHotspotConfig),
              imageUrl: "",
              requiresAdminSetup: true,
            }
          : copiedConfig,
      media: hasPersistentImage ? slideToCopy.media : undefined,
      isComplete: false,
    };

    const slideIndex = slides.findIndex((slide) => slide.id === id);
    const updatedSlides = [...slides];

    updatedSlides.splice(slideIndex + 1, 0, copiedSlide);

    setSlides(updatedSlides);
    setSelectedSlideId(copiedSlide.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = slides.findIndex((slide) => slide.id === active.id);
    const newIndex = slides.findIndex((slide) => slide.id === over.id);

    setSlides(arrayMove(slides, oldIndex, newIndex));
  }

  return (
    <div
  onPointerDown={onFocusBuilder}
  onFocusCapture={onFocusBuilder}
  className="rounded-xl border border-slate-200 bg-slate-50 p-5"
>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Training Slides</h3>
          <p className="text-sm text-slate-500">
            Build the lesson one slide at a time.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsBlockMenuOpen((isOpen) => !isOpen)}
            className="company-primary-button flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            aria-expanded={isBlockMenuOpen}
            aria-haspopup="menu"
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            Add Learning Block
          </button>

          {isBlockMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white py-2 shadow-xl"
            >
              {learningBlockTemplates.map((block) => {
                const Icon = block.icon;

                return (
                  <button
                    key={block.type}
                    type="button"
                    role="menuitem"
                    onClick={() => addLearningBlock(block.type)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Icon
                      size={17}
                      strokeWidth={2.3}
                      className="text-slate-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        {block.label}
                        {block.isInteractive && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                            Interactive
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {block.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={`grid gap-5 transition-all duration-300 ${
          isOutlineCollapsed
            ? "lg:grid-cols-[44px_1fr]"
            : "lg:grid-cols-[280px_1fr]"
        }`}
      >
        <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300">
          <div
            className={`flex items-center border-b border-slate-200 p-3 ${
              isOutlineCollapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!isOutlineCollapsed && (
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Course Outline
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsOutlineCollapsed(!isOutlineCollapsed)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              title={
                isOutlineCollapsed
                  ? "Expand course outline"
                  : "Collapse course outline"
              }
            >
              {isOutlineCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {isOutlineCollapsed && (
            <div className="flex flex-col items-center gap-2 p-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setSelectedSlideId(slide.id)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                    slide.id === selectedSlideId
                      ? "bg-blue-600 text-white"
                      : slide.isComplete
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                  title={`${slide.title || `Slide ${index + 1}`} - ${
                    slide.isComplete ? "Ready" : "Incomplete"
                  }`}
                >
                  <div className="relative flex h-8 w-8 items-center justify-center">
                    <span>{index + 1}</span>

                    <span
                      className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        slide.isComplete
                          ? "bg-green-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {slide.isComplete ? "✓" : "!"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!isOutlineCollapsed && (
            <div className="p-3">
              <DndContext
                id="slide-builder-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={slides.map((slide) => slide.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {slides.map((slide, index) => (
                      <SortableSlideButton
                        key={slide.id}
                        slide={slide}
                        index={index}
                        isSelected={slide.id === selectedSlideId}
                        onSelect={() => setSelectedSlideId(slide.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Slide {selectedSlideIndex + 1} of {slides.length}
              </p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">
                {selectedSlide.title || "Untitled Slide"}
              </h4>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => toggleSlideComplete(selectedSlide.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  selectedSlide.isComplete
                    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {selectedSlide.isComplete
                  ? "Mark Incomplete"
                  : "Mark Complete"}
              </button>

              <button
                type="button"
                onClick={() => duplicateSlide(selectedSlide.id)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Duplicate
              </button>

              <button
                type="button"
                onClick={() => deleteSlide(selectedSlide.id)}
                disabled={slides.length === 1}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:text-slate-300"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Slide Title
              </label>
              <input
                type="text"
                value={selectedSlide.title}
                onChange={(event) =>
                  updateSlide(selectedSlide.id, "title", event.target.value)
                }
                placeholder="Example: Welcome to Hospitality 101"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Slide Body
                </label>
              <div className="mt-2 flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 px-2 py-2">
                {bodyFormatButtons.map((button) => {
                  const Icon = button.icon;

                  return (
                    <button
                      key={button.action}
                      type="button"
                      onClick={() => applyBodyFormat(button.action)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-blue-600"
                      title={button.label}
                      aria-label={button.label}
                    >
                      <Icon size={17} strokeWidth={2.4} />
                    </button>
                  );
                })}

                <div className="ml-1 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-slate-600">
                  <Palette size={16} strokeWidth={2.4} aria-hidden="true" />
                  <select
                    value={selectedBodyColor}
                    onChange={(event) =>
                      applyBodyColor(event.target.value as BodyTextColor)
                    }
                    className="bg-transparent text-xs font-semibold text-slate-700 outline-none"
                    title="Text color"
                    aria-label="Text color"
                  >
                    {bodyTextColorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                ref={bodyEditorRef}
                contentEditable
                suppressContentEditableWarning
                aria-label="Slide body"
                data-placeholder="Write the training content for this slide..."
                onBlur={() => {
                  updateBodySelection();
                  syncEditorBody();
                }}
                onFocus={updateBodySelection}
                onInput={() => {
                  updateBodySelection();
                  syncEditorBody();
                }}
                onKeyUp={updateBodySelection}
                onMouseUp={updateBodySelection}
                className="min-h-[260px] w-full rounded-b-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-600 [&:empty:before]:text-slate-400 [&:empty:before]:content-[attr(data-placeholder)] [&_li]:pl-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
              />
            </div>

            <div className={selectedSlide.slide_type === "image_hotspot" ? "order-4" : ""}>
              <LearningBlockConfigEditor
                slide={selectedSlide}
                onChange={updateSelectedSlideConfig}
              />
            </div>

            <div className={selectedSlide.slide_type === "image_hotspot" ? "order-3" : ""}>
                <label className="block text-sm font-semibold text-slate-700">
                {selectedSlide.slide_type === "image_hotspot" ? "Image Setup" : "Slide Image"}
                </label>

              <div className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-4">
                {selectedSlide.media?.type === "image" ? (
                  <div className="space-y-3">
                    {selectedSlide.slide_type !== "image_hotspot" && (
                      <div className="relative h-72 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <Image
                          src={selectedSlide.media.url}
                          alt={selectedSlide.media.alt || ""}
                          fill
                          sizes="(max-width: 768px) 100vw, 680px"
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {selectedSlide.media.fileName || "Slide image"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {uploadingImageSlideIds.has(selectedSlide.id)
                            ? "Uploading image..."
                            : selectedSlide.media.isLocalPreview
                              ? "Upload failed. Select the image again to retry."
                              : "Uploaded permanently"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={uploadingImageSlideIds.has(selectedSlide.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Replace
                        </button>

                        <button
                          type="button"
                          onClick={removeSlideImage}
                          disabled={uploadingImageSlideIds.has(selectedSlide.id)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {selectedSlide.slide_type === "image_hotspot" && (
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">
                          Alt text <span className="font-normal text-slate-400">(optional)</span>
                        </span>
                        <input
                          type="text"
                          value={selectedSlide.media.alt || ""}
                          onChange={(event) =>
                            updateSlideMedia(selectedSlide.id, {
                              ...selectedSlide.media!,
                              alt: event.target.value,
                            })
                          }
                          placeholder="Describe the image for learners using assistive technology"
                          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div>
                    {selectedSlide.slide_type === "image_hotspot" &&
                      (selectedSlide.config_json as ImageHotspotConfig)
                        .requiresAdminSetup && (
                        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                          This image was not uploaded permanently. Please select the image again.
                        </p>
                      )}
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <ImageIcon size={18} strokeWidth={2.2} />
                      Upload slide image
                    </button>
                  </div>
                )}

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    handleSlideImageChange(event.target.files?.[0])
                  }
                />

                {imageError && (
                  <p className="mt-3 text-sm font-medium text-red-600">
                    {imageError}
                  </p>
                )}

                <p className="mt-3 text-xs text-slate-500">
                  JPG, PNG, or WebP. Maximum file size 5MB.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ImageHotspotConfigEditor({
  slide,
  config,
  onChange,
}: {
  slide: Slide;
  config: ImageHotspotConfig;
  onChange: (config: LearningBlockConfig) => void;
}) {
  const [selectedHotspotId, setSelectedHotspotId] = useState("");
  const [isAdding, setIsAdding] = useState(config.hotspots.length === 0);
  const [imageAspectRatio, setImageAspectRatio] = useState(16 / 9);
  const canvasRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ hotspotId: string; pointerId: number } | null>(null);
  const selectedIndex = config.hotspots.findIndex(
    (hotspot) => hotspot.id === selectedHotspotId
  );
  const selectedHotspot = config.hotspots[selectedIndex];

  function updateHotspot(
    hotspotId: string,
    patch: Partial<ImageHotspotConfig["hotspots"][number]>
  ) {
    onChange({
      ...config,
      hotspots: config.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, ...patch } : hotspot
      ),
    });
  }

  function removeHotspot(hotspotId: string) {
    onChange({
      ...config,
      hotspots: config.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
    });
    setSelectedHotspotId("");
  }

  function percentFromPointer(event: ReactPointerEvent) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;

    return {
      xPercent: Math.round(
        Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)) *
          10
      ) / 10,
      yPercent: Math.round(
        Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)) *
          10
      ) / 10,
    };
  }

  function addHotspot(event: ReactPointerEvent<HTMLDivElement>) {
    if (!config.imageUrl || !isAdding || event.button !== 0) return;
    const position = percentFromPointer(event);
    if (!position) return;
    const hotspotId = nextItemId(
      "hotspot",
      config.hotspots.map((hotspot) => hotspot.id)
    );

    onChange({
      ...config,
      hotspots: [
        ...config.hotspots,
        {
          id: hotspotId,
          ...position,
          title: `Hotspot ${config.hotspots.length + 1}`,
          description: "",
          isRequired: true,
        },
      ],
    });
    setSelectedHotspotId(hotspotId);
    setIsAdding(false);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  function startDragging(
    event: ReactPointerEvent<HTMLButtonElement>,
    hotspotId: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedHotspotId(hotspotId);
    dragRef.current = { hotspotId, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragHotspot(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const position = percentFromPointer(event);
    if (position) updateHotspot(drag.hotspotId, position);
  }

  function stopDragging(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <ConfigShell title="Image Hotspot">
      <TextField
        label="Instruction"
        value={config.instruction}
        onChange={(instruction) => onChange({ ...config, instruction })}
      />
      <ToggleField
        label="Require all required hotspots before continuing"
        checked={config.requireAllHotspots !== false}
        onChange={(requireAllHotspots) =>
          onChange({ ...config, requireAllHotspots })
        }
      />

      <section aria-labelledby="hotspot-editor-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h5 id="hotspot-editor-heading" className="text-sm font-bold text-slate-900">
              Hotspot Editor
            </h5>
            <p className="mt-1 text-xs text-slate-500">
              Add a marker, then drag it anywhere on the image.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsAdding((current) => !current)}
              disabled={!config.imageUrl}
              aria-pressed={isAdding}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isAdding
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {isAdding ? "Click image to place" : "Add Hotspot"}
            </button>
            <button
              type="button"
              onClick={() => selectedHotspot && removeHotspot(selectedHotspot.id)}
              disabled={!selectedHotspot}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete Selected
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-4">
          {config.imageUrl ? (
            <div
              ref={canvasRef}
              onPointerDown={addHotspot}
              className={`relative mx-auto w-full max-w-5xl touch-none overflow-hidden rounded-lg bg-white shadow-sm select-none ${
                isAdding ? "cursor-crosshair ring-2 ring-blue-400 ring-offset-2" : "cursor-default"
              }`}
              style={{ aspectRatio: imageAspectRatio }}
              aria-label="Hotspot image canvas"
            >
              <Image
                src={config.imageUrl}
                alt={slide.media?.alt || slide.title || "Hotspot image"}
                fill
                sizes="(max-width: 1024px) 100vw, 1024px"
                unoptimized
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth && image.naturalHeight) {
                    setImageAspectRatio(image.naturalWidth / image.naturalHeight);
                  }
                }}
                className="pointer-events-none object-contain"
              />

              {config.hotspots.length === 0 && (
                <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-slate-950/75 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg sm:left-1/2 sm:right-auto sm:w-max sm:max-w-[calc(100%-2rem)] sm:-translate-x-1/2">
                  Click anywhere on the image to add your first hotspot.
                </div>
              )}

              {config.hotspots.map((hotspot, index) => {
                const isSelected = hotspot.id === selectedHotspotId;
                const label = hotspot.title.trim() || "Untitled hotspot";

                return (
                  <button
                    key={hotspot.id}
                    type="button"
                    onPointerDown={(event) => startDragging(event, hotspot.id)}
                    onPointerMove={dragHotspot}
                    onPointerUp={stopDragging}
                    onPointerCancel={stopDragging}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedHotspotId(hotspot.id);
                    }}
                    className={`group absolute z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-orange-600 text-sm font-bold text-white shadow-[0_2px_8px_rgba(15,23,42,0.65)] transition hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-300 active:cursor-grabbing ${
                      isSelected ? "scale-110 ring-4 ring-blue-400" : ""
                    }`}
                    style={{ left: `${hotspot.xPercent}%`, top: `${hotspot.yPercent}%` }}
                    aria-label={`Hotspot ${index + 1}: ${label}${
                      hotspot.isRequired !== false ? ", required" : ""
                    }. Drag to reposition.`}
                    title={`${label} — drag to reposition`}
                  >
                    {index + 1}
                    {hotspot.isRequired !== false && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-slate-900 px-1 text-[10px] leading-none text-white"
                      >
                        *
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-5 text-center text-sm font-semibold text-slate-500">
              Upload an image in Image Setup to begin adding hotspots.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
        {selectedHotspot ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Editing Hotspot {selectedIndex + 1}
                </p>
                <p className="mt-1 text-xs text-slate-500">Changes appear in the preview immediately.</p>
              </div>
              <button
                type="button"
                onClick={() => removeHotspot(selectedHotspot.id)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete marker
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Marker title</span>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={selectedHotspot.title}
                  onChange={(event) =>
                    updateHotspot(selectedHotspot.id, { title: event.target.value })
                  }
                  placeholder={`Hotspot ${selectedIndex + 1}`}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
              </label>
              <ToggleField
                label="Required"
                checked={selectedHotspot.isRequired !== false}
                onChange={(isRequired) => updateHotspot(selectedHotspot.id, { isRequired })}
              />
            </div>
            <div className="mt-4">
              <TextAreaField
                label="Description"
                value={selectedHotspot.description}
                onChange={(description) => updateHotspot(selectedHotspot.id, { description })}
              />
            </div>
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold">Position details</summary>
              <p className="mt-2">
                Horizontal {selectedHotspot.xPercent.toFixed(1)}% · Vertical{" "}
                {selectedHotspot.yPercent.toFixed(1)}%
              </p>
            </details>
          </>
        ) : (
          <p className="text-sm font-semibold text-slate-500">
            Select a marker or click the image to add one.
          </p>
        )}
      </section>

      <section aria-labelledby="hotspot-list-heading">
        <div className="flex items-center justify-between gap-3">
          <h5 id="hotspot-list-heading" className="text-sm font-bold text-slate-900">
            Hotspot List
          </h5>
          <span className="text-xs font-semibold text-slate-500">
            {config.hotspots.length} {config.hotspots.length === 1 ? "marker" : "markers"}
          </span>
        </div>
        {config.hotspots.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {config.hotspots.map((hotspot, index) => (
              <div
                key={hotspot.id}
                className={`flex items-center gap-3 border-b border-slate-200 p-2 last:border-b-0 ${
                  hotspot.id === selectedHotspotId ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedHotspotId(hotspot.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-pressed={hotspot.id === selectedHotspotId}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                    {hotspot.title.trim() || `Untitled hotspot ${index + 1}`}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {hotspot.isRequired !== false ? "Required" : "Optional"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeHotspot(hotspot.id)}
                  className="rounded-md px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  aria-label={`Delete hotspot ${index + 1}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">
            Your markers will appear here.
          </p>
        )}
      </section>
    </ConfigShell>
  );
}

function nextItemId(prefix: string, existingIds: string[]) {
  let index = existingIds.length + 1;
  let nextId = `${prefix}-${index}`;

  while (existingIds.includes(nextId)) {
    index += 1;
    nextId = `${prefix}-${index}`;
  }

  return nextId;
}

function ConfigShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-600"
      />
    </label>
  );
}

function AnswerEditor({
  answers,
  correctAnswerId,
  onAnswersChange,
  onCorrectAnswerChange,
  label,
}: {
  answers: LearningBlockAnswer[];
  correctAnswerId: string;
  onAnswersChange: (answers: LearningBlockAnswer[]) => void;
  onCorrectAnswerChange: (answerId: string) => void;
  label: string;
}) {
  function updateAnswer(answerId: string, text: string) {
    onAnswersChange(
      answers.map((answer) => (answer.id === answerId ? { ...answer, text } : answer))
    );
  }

  function addAnswer() {
    if (answers.length >= 6) return;
    onAnswersChange([
      ...answers,
      { id: nextItemId("answer", answers.map((answer) => answer.id)), text: "" },
    ]);
  }

  function removeAnswer(answerId: string) {
    if (answers.length <= 2) return;
    const nextAnswers = answers.filter((answer) => answer.id !== answerId);
    onAnswersChange(nextAnswers);
    if (correctAnswerId === answerId) {
      onCorrectAnswerChange(nextAnswers[0]?.id ?? "");
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <div className="mt-2 space-y-2">
        {answers.map((answer, index) => (
          <div key={answer.id} className="flex flex-col gap-2 md:flex-row">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="radio"
                checked={correctAnswerId === answer.id}
                onChange={() => onCorrectAnswerChange(answer.id)}
              />
              Correct
            </label>
            <input
              type="text"
              value={answer.text}
              onChange={(event) => updateAnswer(answer.id, event.target.value)}
              placeholder={`Choice ${index + 1}`}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => removeAnswer(answer.id)}
              disabled={answers.length <= 2}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addAnswer}
        disabled={answers.length >= 6}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        Add choice
      </button>
    </div>
  );
}

function LearningBlockConfigEditor({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (config: LearningBlockConfig) => void;
}) {
  const type = normalizeLearningBlockType(slide.slide_type);

  if (type === "knowledge_check") {
    const config = normalizeLearningBlockConfig(
      type,
      slide.config_json
    ) as KnowledgeCheckConfig;

    return (
      <ConfigShell title="Knowledge Check">
        <TextField
          label="Question"
          value={config.question}
          onChange={(question) => onChange({ ...config, question })}
        />
        <AnswerEditor
          label="Answer choices"
          answers={config.answers}
          correctAnswerId={config.correctAnswerId}
          onAnswersChange={(answers) => onChange({ ...config, answers })}
          onCorrectAnswerChange={(correctAnswerId) =>
            onChange({ ...config, correctAnswerId })
          }
        />
        <TextAreaField
          label="Explanation"
          value={config.explanation}
          onChange={(explanation) => onChange({ ...config, explanation })}
        />
        <ToggleField
          label="Allow retry"
          checked={config.allowRetry !== false}
          onChange={(allowRetry) => onChange({ ...config, allowRetry })}
        />
      </ConfigShell>
    );
  }

  if (type === "scenario") {
    const config = normalizeLearningBlockConfig(
      type,
      slide.config_json
    ) as ScenarioBlockConfig;

    return (
      <ConfigShell title="Scenario">
        <TextAreaField
          label="Scenario description"
          value={config.scenarioText}
          onChange={(scenarioText) => onChange({ ...config, scenarioText })}
        />
        <TextField
          label="Decision question"
          value={config.question}
          onChange={(question) => onChange({ ...config, question })}
        />
        <AnswerEditor
          label="Response options"
          answers={config.answers}
          correctAnswerId={config.correctAnswerId}
          onAnswersChange={(answers) => onChange({ ...config, answers })}
          onCorrectAnswerChange={(correctAnswerId) =>
            onChange({ ...config, correctAnswerId })
          }
        />
        <TextAreaField
          label="Feedback / explanation"
          value={config.explanation}
          onChange={(explanation) => onChange({ ...config, explanation })}
        />
        <ToggleField
          label="Allow retry"
          checked={config.allowRetry !== false}
          onChange={(allowRetry) => onChange({ ...config, allowRetry })}
        />
      </ConfigShell>
    );
  }

  if (type === "reflection") {
    const config = normalizeLearningBlockConfig(
      type,
      slide.config_json
    ) as ReflectionBlockConfig;

    return (
      <ConfigShell title="Reflection">
        <TextAreaField
          label="Prompt"
          value={config.prompt}
          onChange={(prompt) => onChange({ ...config, prompt })}
        />
        <TextField
          label="Placeholder"
          value={config.placeholder ?? ""}
          onChange={(placeholder) => onChange({ ...config, placeholder })}
        />
        <ToggleField
          label="Response required before continuing"
          checked={Boolean(config.responseRequired)}
          onChange={(responseRequired) => onChange({ ...config, responseRequired })}
        />
      </ConfigShell>
    );
  }

  if (type === "recap") {
    const config = normalizeLearningBlockConfig(type, slide.config_json) as RecapBlockConfig;

    function updateItem(index: number, value: string) {
      onChange({
        ...config,
        items: config.items.map((item, itemIndex) =>
          itemIndex === index ? value : item
        ),
      });
    }

    function removeItem(index: number) {
      if (config.items.length <= 1) return;
      onChange({
        ...config,
        items: config.items.filter((_, itemIndex) => itemIndex !== index),
      });
    }

    return (
      <ConfigShell title="Recap">
        <div>
          <p className="text-sm font-semibold text-slate-700">Takeaways</p>
          <div className="mt-2 space-y-2">
            {config.items.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(event) => updateItem(index, event.target.value)}
                  placeholder={`Takeaway ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={config.items.length <= 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...config, items: [...config.items, ""] })}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add takeaway
          </button>
        </div>
        <TextAreaField
          label="Closing message"
          value={config.closingMessage ?? ""}
          onChange={(closingMessage) => onChange({ ...config, closingMessage })}
        />
      </ConfigShell>
    );
  }

  if (type === "image_hotspot") {
    const config = normalizeLearningBlockConfig(
      type,
      slide.config_json,
      { imageUrl: slide.media?.url }
    ) as ImageHotspotConfig;

    return <ImageHotspotConfigEditor slide={slide} config={config} onChange={onChange} />;
  }

  const config = normalizeLearningBlockConfig(type, slide.config_json);

  return (
    <ConfigShell title="Content Layout">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Layout</span>
        <select
          value={(config as { layout?: string }).layout ?? "standard"}
          onChange={(event) =>
            onChange({
              ...config,
              layout: event.target.value as ContentBlockConfig["layout"],
            })
          }
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
        >
          <option value="standard">Standard</option>
          <option value="image_top">Image top</option>
          <option value="text_left">Text left</option>
          <option value="text_right">Text right</option>
        </select>
      </label>
    </ConfigShell>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}

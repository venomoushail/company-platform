"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
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
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Palette,
  Pilcrow,
} from "lucide-react";
import Image from "next/image";

export type Slide = {
  id: number;
  title: string;
  body: string;
  media?: SlideMedia;
  isComplete: boolean;
};

export type SlideMedia = {
  type: "image";
  url: string;
  alt?: string;
  fileName?: string;
  storagePath?: string;
};

type SlideBuilderProps = {
  slides: Slide[];
  setSlides: Dispatch<SetStateAction<Slide[]>>;
  selectedSlideId: number;
  setSelectedSlideId: (id: number) => void;
  onFocusBuilder?: () => void;
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

const inlineMarkupPattern =
  /(\[color=(blue|green|red|orange|gray|black)\][\s\S]+?\[\/color\]|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;

const maxSlideImageSizeBytes = 5 * 1024 * 1024;
const acceptedSlideImageTypes = ["image/jpeg", "image/png", "image/webp"];

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

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  let childrenText = Array.from(node.childNodes).map(serializeInlineNode).join("");
  const textColor = getNodeTextColor(node);

  if (node.tagName === "STRONG" || node.tagName === "B") {
    childrenText = `**${childrenText}**`;
  }

  if (node.tagName === "EM" || node.tagName === "I") {
    childrenText = `*${childrenText}*`;
  }

  if (textColor) {
    return `[color=${textColor}]${childrenText}[/color]`;
  }

  return childrenText;
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

function serializeEditorBlock(element: HTMLElement): string {
  if (element.tagName === "UL" || element.tagName === "OL") {
    const isOrdered = element.tagName === "OL";

    return Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child, index) => {
        const prefix = isOrdered ? `${index + 1}. ` : "- ";
        return `${prefix}${serializeInlineNode(child).replace(/\n/g, " ").trim()}`;
      })
      .join("\n");
  }

  const inlineText = Array.from(element.childNodes).map(serializeInlineNode).join("");
  const normalizedText = inlineText.replace(/\n+$/g, "");

  if (isBlankEditorBlock(normalizedText)) {
    return "";
  }

  if (/^H[1-6]$/.test(element.tagName)) {
    return `## ${normalizedText.trim()}`;
  }

  return normalizedText;
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
  return Array.from(editor.childNodes)
    .map((child) => {
      if (child instanceof HTMLElement) {
        return serializeEditorBlock(child);
      }

      return serializeInlineNode(child).trim();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lessonBodyToPlainText(body: string) {
  return body
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
}: SlideBuilderProps) {
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [selectedBodyColor, setSelectedBodyColor] =
    useState<BodyTextColor>("default");
  const [imageError, setImageError] = useState("");
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

  function addSlide() {
    const newSlide: Slide = {
      id: Date.now(),
      title: "",
      body: "",
      isComplete: false,
    };

    setSlides([...slides, newSlide]);
    setSelectedSlideId(newSlide.id);
  }

  function updateSlide(id: number, field: "title" | "body", value: string) {
    setSlides(
      slides.map((slide) =>
        slide.id === id ? { ...slide, [field]: value } : slide
      )
    );
  }

  function updateSlideBody(id: number, value: string) {
    updateSlide(id, "body", value);
  }

  function updateSlideMedia(id: number, media?: SlideMedia) {
    setSlides(
      slides.map((slide) => (slide.id === id ? { ...slide, media } : slide))
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

  function handleSlideImageChange(file: File | undefined) {
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
    });

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

    const copiedSlide: Slide = {
      ...slideToCopy,
      id: Date.now(),
      title: slideToCopy.title
        ? `${slideToCopy.title} Copy`
        : "Untitled Slide Copy",
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

        <button
          type="button"
          onClick={addSlide}
          className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
        >
          + Add Slide
        </button>
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

          <div className="space-y-5">
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
                className="min-h-[260px] w-full rounded-b-lg border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-600 [&:empty:before]:text-slate-400 [&:empty:before]:content-[attr(data-placeholder)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">
                Slide Image
              </label>

              <div className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-4">
                {selectedSlide.media?.type === "image" ? (
                  <div className="space-y-3">
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

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {selectedSlide.media.fileName || "Slide image"}
                        </p>
                        <p className="text-xs text-slate-500">
                          JPG, PNG, or WebP. Max 5MB.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Replace
                        </button>

                        <button
                          type="button"
                          onClick={removeSlideImage}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <ImageIcon size={18} strokeWidth={2.2} />
                    Upload slide image
                  </button>
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
                  Storage upload is ready to connect once the Supabase image
                  bucket and policies are configured.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

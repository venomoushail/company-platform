import { ReactNode } from "react";

type LessonContentProps = {
  content?: string;
  emptyText?: string;
  className?: string;
  emptyClassName?: string;
  headingClassName?: string;
};

type TextToken =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "strong" | "em";
      value: string;
    }
  | {
      type: "color";
      color: LessonTextColor;
      value: string;
    };

type ContentBlock =
  | {
      type: "paragraph" | "heading";
      lines: string[];
    }
  | {
      type: "unordered-list" | "ordered-list";
      items: string[];
    }
  | {
      type: "blank";
    };

const unorderedListPattern = /^\s*[-*]\s+(.+)$/;
const orderedListPattern = /^\s*\d+[.)]\s+(.+)$/;
const headingPattern = /^\s{0,3}#{1,3}\s+(.+)$/;
const inlineFormatPattern =
  /(\[color=(blue|green|red|orange|gray|black)\][\s\S]+?\[\/color\]|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;

type LessonTextColor = "blue" | "green" | "red" | "orange" | "gray" | "black";

const textColorClasses: Record<LessonTextColor, string> = {
  blue: "text-blue-700",
  green: "text-green-700",
  red: "text-red-700",
  orange: "text-orange-700",
  gray: "text-slate-600",
  black: "text-slate-950",
};

function parseInlineText(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let lastIndex = 0;

  text.replace(inlineFormatPattern, (match, _group, offset: number) => {
    if (offset > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, offset) });
    }

    if (match.startsWith("[color=")) {
      const colorMatch = match.match(
        /^\[color=(blue|green|red|orange|gray|black)\]([\s\S]+)\[\/color\]$/
      );

      if (colorMatch) {
        tokens.push({
          type: "color",
          color: colorMatch[1] as LessonTextColor,
          value: colorMatch[2],
        });
      } else {
        tokens.push({ type: "text", value: match });
      }
    } else if (
      (match.startsWith("**") && match.endsWith("**")) ||
      (match.startsWith("__") && match.endsWith("__"))
    ) {
      tokens.push({ type: "strong", value: match.slice(2, -2) });
    } else {
      tokens.push({ type: "em", value: match.slice(1, -1) });
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: text }];
}

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  return parseInlineText(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.type === "strong") {
      return (
        <strong key={key} className="font-bold">
          {token.value}
        </strong>
      );
    }

    if (token.type === "em") {
      return (
        <em key={key} className="italic">
          {token.value}
        </em>
      );
    }

    if (token.type === "color") {
      return (
        <span key={key} className={textColorClasses[token.color]}>
          {renderInlineText(token.value, `${key}-color`)}
        </span>
      );
    }

    return token.value;
  });
}

function getLineContent(line: string, pattern: RegExp) {
  return line.match(pattern)?.[1] ?? line.trim();
}

function parseLessonContent(content: string): ContentBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ContentBlock[] = [];
  let currentParagraph: string[] = [];
  let blankLineCount = 0;

  function flushParagraph() {
    if (currentParagraph.length === 0) return;

    const firstLine = currentParagraph[0];
    const headingText =
      currentParagraph.length === 1 ? firstLine.match(headingPattern)?.[1] : null;

    blocks.push({
      type: headingText ? "heading" : "paragraph",
      lines: headingText ? [headingText] : currentParagraph,
    });

    currentParagraph = [];
  }

  function flushBlankLines() {
    if (blankLineCount > 1) {
      for (let index = 1; index < blankLineCount; index += 1) {
        blocks.push({ type: "blank" });
      }
    }

    blankLineCount = 0;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      blankLineCount += 1;
      continue;
    }

    flushBlankLines();

    const unorderedMatch = line.match(unorderedListPattern);
    const orderedMatch = line.match(orderedListPattern);

    if (unorderedMatch || orderedMatch) {
      flushParagraph();

      const listType = unorderedMatch ? "unordered-list" : "ordered-list";
      const listPattern = unorderedMatch ? unorderedListPattern : orderedListPattern;
      const items = [getLineContent(line, listPattern)];

      while (index + 1 < lines.length && listPattern.test(lines[index + 1])) {
        index += 1;
        items.push(getLineContent(lines[index], listPattern));
      }

      blocks.push({ type: listType, items });
      continue;
    }

    currentParagraph.push(trimmedLine);
  }

  flushParagraph();

  return blocks;
}

export default function LessonContent({
  content = "",
  emptyText = "Slide content will appear here.",
  className = "space-y-5 text-xl leading-9 text-slate-700",
  emptyClassName = "text-xl leading-9 text-slate-500",
  headingClassName = "pt-1 text-2xl font-bold leading-8 text-slate-900",
}: LessonContentProps) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return <p className={emptyClassName}>{emptyText}</p>;
  }

  const blocks = parseLessonContent(content);

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "blank") {
          return <div key={blockIndex} className="h-3" aria-hidden="true" />;
        }

        if (block.type === "heading") {
          return (
            <h3
              key={blockIndex}
              className={headingClassName}
            >
              {renderInlineText(block.lines[0], `heading-${blockIndex}`)}
            </h3>
          );
        }

        if (block.type === "unordered-list" || block.type === "ordered-list") {
          const ListTag = block.type === "unordered-list" ? "ul" : "ol";
          const listClassName =
            block.type === "unordered-list"
              ? "list-disc space-y-2 pl-7"
              : "list-decimal space-y-2 pl-7";

          return (
            <ListTag key={blockIndex} className={listClassName}>
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`} className="pl-1">
                  {renderInlineText(item, `list-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={blockIndex}>
              {block.lines.map((line, lineIndex) => (
                <span key={`${blockIndex}-${lineIndex}`}>
                  {lineIndex > 0 && <br />}
                  {renderInlineText(line, `paragraph-${blockIndex}-${lineIndex}`)}
                </span>
              ))}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}

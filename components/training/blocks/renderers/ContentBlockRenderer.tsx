import LessonContent from "@/components/training/LessonContent";
import type { ContentBlockConfig } from "@/types/learningBlocks";
import Image from "next/image";

export type ContentBlockRendererProps = {
  title: string;
  body: string;
  imageUrl?: string | null;
  imageAlt?: string;
  config: ContentBlockConfig;
  titleClassName?: string;
  imageClassName?: string;
  imageSizes?: string;
  contentClassName?: string;
  emptyContentClassName?: string;
  headingClassName?: string;
};

export default function ContentBlockRenderer({
  title,
  body,
  imageUrl,
  imageAlt,
  config,
  titleClassName = "text-3xl font-bold leading-tight text-slate-900",
  imageClassName = "h-80 rounded-xl",
  imageSizes = "(max-width: 768px) 100vw, 760px",
  contentClassName,
  emptyContentClassName,
  headingClassName,
}: ContentBlockRendererProps) {
  const layout = config.layout ?? "standard";
  const image = imageUrl ? (
    <div
      className={`relative overflow-hidden border border-slate-200 bg-slate-50 ${imageClassName}`}
    >
      <Image
        src={imageUrl}
        alt={imageAlt || ""}
        fill
        sizes={imageSizes}
        unoptimized
        className="object-contain"
      />
    </div>
  ) : null;
  const content = (
    <LessonContent
      content={body}
      className={contentClassName}
      emptyClassName={emptyContentClassName}
      headingClassName={headingClassName}
    />
  );

  if (layout === "text_left" || layout === "text_right") {
    return (
      <>
        <h1 className={titleClassName}>{title || "Untitled Block"}</h1>
        <div className="mt-6 grid gap-6 md:grid-cols-2 md:items-start">
          {layout === "text_left" ? (
            <>
              <div>{content}</div>
              {image}
            </>
          ) : (
            <>
              {image}
              <div>{content}</div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={titleClassName}>{title || "Untitled Block"}</h1>
      {layout === "image_top" && image ? <div className="mt-6">{image}</div> : null}
      <div className="mt-6">{content}</div>
      {layout !== "image_top" && image ? <div className="mt-6">{image}</div> : null}
    </>
  );
}

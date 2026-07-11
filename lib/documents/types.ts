import "server-only";

export type ExtractionMethod =
  | "docx"
  | "txt"
  | "pdf_embedded_text"
  | "pdf_ocr"
  | "manual_paste";

export type DocumentExtractionResult = {
  success: boolean;
  text: string;
  method: ExtractionMethod;
  pageCount: number | null;
  confidence: number | null;
  characterCount: number;
  warning?: string;
  error?: string;
};

export type ExtractDocumentInput = {
  fileBuffer: ArrayBuffer | Buffer;
  filename: string;
  mimeType?: string | null;
};

export function createExtractionResult(
  values: Omit<DocumentExtractionResult, "characterCount">
): DocumentExtractionResult {
  return {
    ...values,
    characterCount: values.text.trim().length,
  };
}

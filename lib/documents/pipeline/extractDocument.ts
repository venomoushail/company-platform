import "server-only";

import { extractDocxText } from "@/lib/documents/extract/docx";
import { extractPdfText } from "@/lib/documents/extract/pdf";
import { extractTxtText } from "@/lib/documents/extract/txt";
import { createExtractionResult } from "@/lib/documents/types";
import type { DocumentExtractionResult, ExtractDocumentInput } from "@/lib/documents/types";

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();

  return extension ? extension.toLowerCase() : "";
}

export async function extractDocument({
  fileBuffer,
  filename,
  mimeType,
}: ExtractDocumentInput): Promise<DocumentExtractionResult> {
  const fileExtension = getFileExtension(filename);

  if (fileExtension === "docx") {
    return extractDocxText(fileBuffer);
  }

  if (fileExtension === "txt") {
    return extractTxtText(fileBuffer);
  }

  if (fileExtension === "pdf") {
    return extractPdfText(fileBuffer, mimeType || "application/pdf");
  }

  return createExtractionResult({
    success: false,
    text: "",
    method: "manual_paste",
    pageCount: null,
    confidence: 0,
    error:
      "Unsupported file format. Upload a Word document, PDF, text file, or paste the document text manually.",
  });
}

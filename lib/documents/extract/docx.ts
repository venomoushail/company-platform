import "server-only";

import mammoth from "mammoth";
import { createExtractionResult } from "@/lib/documents/types";
import type { DocumentExtractionResult } from "@/lib/documents/types";

function toBuffer(fileBuffer: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
}

export async function extractDocxText(
  fileBuffer: ArrayBuffer | Buffer
): Promise<DocumentExtractionResult> {
  const result = await mammoth.extractRawText({
    buffer: toBuffer(fileBuffer),
  });
  const text = result.value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "docx",
      pageCount: null,
      confidence: 0,
      error:
        "No readable text was found in this Word document. You can paste the document text manually.",
    });
  }

  return createExtractionResult({
    success: true,
    text,
    method: "docx",
    pageCount: null,
    confidence: 1,
  });
}

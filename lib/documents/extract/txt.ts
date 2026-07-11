import "server-only";

import { createExtractionResult } from "@/lib/documents/types";
import type { DocumentExtractionResult } from "@/lib/documents/types";

function toBuffer(fileBuffer: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
}

export async function extractTxtText(
  fileBuffer: ArrayBuffer | Buffer
): Promise<DocumentExtractionResult> {
  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(toBuffer(fileBuffer))
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!text) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "txt",
      pageCount: null,
      confidence: 0,
      error:
        "No readable text was found in this text file. You can paste the document text manually.",
    });
  }

  return createExtractionResult({
    success: true,
    text,
    method: "txt",
    pageCount: null,
    confidence: 1,
  });
}

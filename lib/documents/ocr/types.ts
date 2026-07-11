import "server-only";

import type { DocumentExtractionResult } from "@/lib/documents/types";

export type OcrInput = {
  fileBuffer: ArrayBuffer | Buffer;
  mimeType: string;
};

export type OcrProviderResult = DocumentExtractionResult;

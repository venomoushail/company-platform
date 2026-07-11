import "server-only";

import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { splitPdfIntoChunks } from "@/lib/documents/pdf/splitPdf";
import { createExtractionResult } from "@/lib/documents/types";
import type { OcrInput, OcrProviderResult } from "@/lib/documents/ocr/types";

type GoogleCredentials = {
  client_email?: string;
  private_key?: string;
};

type GoogleDocumentTextAnchor = {
  textSegments?: { startIndex?: string | number | null; endIndex?: string | number | null }[];
};

type GoogleDocumentLayout = {
  textAnchor?: GoogleDocumentTextAnchor | null;
  confidence?: number | null;
};

type GoogleDocumentPage = {
  lines?: { layout?: GoogleDocumentLayout | null }[];
  paragraphs?: { layout?: GoogleDocumentLayout | null }[];
};

type GoogleOcrChunkInput = {
  buffer: Buffer;
  chunkIndex: number;
  startPage: number;
  endPage: number;
  client: DocumentProcessorServiceClient;
  processorName: string;
  mimeType: string;
};

type GoogleOcrChunkResult = {
  text: string;
  pageCount: number;
  confidence: number | null;
};

type OcrChunkResultWithRange = GoogleOcrChunkResult & {
  startPage: number;
  endPage: number;
};

const defaultOcrChunkSize = 25;
const pageLimitFallbackChunkSize = 15;
const defaultMaxOcrPages = 150;
const maxChunkRetries = 2;

class DocumentAiPageLimitError extends Error {
  constructor(
    message: string,
    readonly startPage: number,
    readonly endPage: number
  ) {
    super(message);
    this.name = "DocumentAiPageLimitError";
  }
}

function toBuffer(fileBuffer: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
}

function getConfiguredOcrChunkSize() {
  const configured = Number(process.env.PDF_OCR_CHUNK_SIZE);

  if (!Number.isFinite(configured)) return defaultOcrChunkSize;

  return Math.min(25, Math.max(1, Math.trunc(configured)));
}

function getConfiguredMaxOcrPages() {
  const configured = Number(process.env.MAX_OCR_PAGES);

  if (!Number.isFinite(configured) || configured <= 0) {
    return defaultMaxOcrPages;
  }

  return Math.trunc(configured);
}

function getRequiredGoogleConfig() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim();
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim();

  if (!projectId || !location || !processorId) {
    return {
      error: "Google Document AI is not configured.",
      projectId: null,
      location: null,
      processorId: null,
    };
  }

  return { error: null, projectId, location, processorId };
}

export function isGoogleDocumentAiConfigured() {
  const config = getRequiredGoogleConfig();

  return Boolean(
    !config.error &&
      (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
  );
}

function parseServiceAccountJson() {
  const rawJson = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim();

  if (!rawJson) return null;

  const credentials = JSON.parse(rawJson) as GoogleCredentials;

  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

function createDocumentAiClient(location: string) {
  const serviceAccountJson = parseServiceAccountJson();
  const apiEndpoint =
    location === "us" ? "us-documentai.googleapis.com" : `${location}-documentai.googleapis.com`;

  if (serviceAccountJson) {
    return new DocumentProcessorServiceClient({
      apiEndpoint,
      credentials: serviceAccountJson,
    });
  }

  return new DocumentProcessorServiceClient({ apiEndpoint });
}

function readTextAnchor(fullText: string, textAnchor?: GoogleDocumentTextAnchor | null) {
  const segments = textAnchor?.textSegments ?? [];

  return segments
    .map((segment) => {
      const startIndex = Number(segment.startIndex ?? 0);
      const endIndex = Number(segment.endIndex ?? 0);

      return fullText.slice(startIndex, endIndex);
    })
    .join("");
}

function averageConfidence(page: GoogleDocumentPage) {
  const layouts = [
    ...(page.paragraphs ?? []).map((paragraph) => paragraph.layout),
    ...(page.lines ?? []).map((line) => line.layout),
  ].filter(
    (layout): layout is GoogleDocumentLayout =>
      Boolean(layout && typeof layout.confidence === "number")
  );

  if (!layouts.length) return null;

  return (
    layouts.reduce((sum, layout) => sum + (layout.confidence ?? 0), 0) /
    layouts.length
  );
}

function reconstructText(fullText: string, pages: GoogleDocumentPage[]) {
  const pageTexts = pages.map((page) => {
    const paragraphTexts = (page.paragraphs ?? [])
      .map((paragraph) => readTextAnchor(fullText, paragraph.layout?.textAnchor))
      .map((text) => text.trim())
      .filter(Boolean);

    if (paragraphTexts.length) return paragraphTexts.join("\n\n");

    return (page.lines ?? [])
      .map((line) => readTextAnchor(fullText, line.layout?.textAnchor))
      .map((text) => text.trim())
      .filter(Boolean)
      .join("\n");
  });

  return pageTexts.filter(Boolean).join("\n\n").trim() || fullText.trim();
}

function getSafeErrorForLog(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const message =
    credentialsPath && rawMessage.includes(credentialsPath)
      ? rawMessage.replaceAll(credentialsPath, "[redacted credentials path]")
      : rawMessage;

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message,
  };
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const status = (error as { code?: unknown; status?: unknown }).code;
  const fallbackStatus = (error as { status?: unknown }).status;
  const numericStatus =
    typeof status === "number"
      ? status
      : typeof fallbackStatus === "number"
        ? fallbackStatus
        : null;

  return numericStatus;
}

function isTransientGoogleError(error: unknown) {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("network")
  );
}

function isDocumentAiPageLimitError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    message.includes("pages") &&
    message.includes("exceed") &&
    message.includes("limit")
  );
}

async function withTransientRetry<T>(
  operation: () => Promise<T>,
  chunk: Pick<GoogleOcrChunkInput, "chunkIndex" | "startPage" | "endPage">
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxChunkRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientGoogleError(error) || attempt === maxChunkRetries) {
        throw error;
      }

      const delayMs = 500 * 2 ** attempt;
      console.warn("[document-extraction] Retrying OCR chunk", {
        chunkIndex: chunk.chunkIndex,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        attempt: attempt + 1,
        error: getSafeErrorForLog(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export async function processPdfChunkWithGoogleOcr({
  buffer,
  chunkIndex,
  startPage,
  endPage,
  client,
  processorName,
  mimeType,
}: GoogleOcrChunkInput): Promise<GoogleOcrChunkResult> {
  return withTransientRetry(async () => {
    const [response] = await client.processDocument({
      name: processorName,
      imagelessMode: true,
      rawDocument: {
        content: buffer.toString("base64"),
        mimeType,
      },
    });
    const document = response.document;
    const pages = (document?.pages ?? []) as GoogleDocumentPage[];
    const text = reconstructText(document?.text ?? "", pages);
    const confidenceValues = pages
      .map((page) => averageConfidence(page))
      .filter((value): value is number => typeof value === "number");
    const confidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) /
        confidenceValues.length
      : null;

    return {
      text,
      pageCount: pages.length || endPage - startPage + 1,
      confidence,
    };
  }, { chunkIndex, startPage, endPage });
}

async function processPdfChunksWithGoogleOcr({
  pdfBuffer,
  chunkSize,
  client,
  processorName,
  mimeType,
}: {
  pdfBuffer: Buffer;
  chunkSize: number;
  client: DocumentProcessorServiceClient;
  processorName: string;
  mimeType: string;
}) {
  const splitResult = await splitPdfIntoChunks(pdfBuffer, chunkSize);
  const chunkResults: OcrChunkResultWithRange[] = [];

  console.info("[document-extraction] Starting PDF OCR", {
    totalPages: splitResult.totalPages,
    chunks: splitResult.chunks.length,
    chunkSize,
    imagelessMode: true,
  });

  for (const chunk of splitResult.chunks) {
    console.info("[document-extraction] Running OCR chunk", {
      chunkNumber: chunk.chunkIndex + 1,
      totalChunks: splitResult.chunks.length,
      startPage: chunk.startPage,
      endPage: chunk.endPage,
      imagelessMode: true,
    });

    try {
      const result = await processPdfChunkWithGoogleOcr({
        buffer: chunk.buffer,
        chunkIndex: chunk.chunkIndex,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        client,
        processorName,
        mimeType,
      });

      chunkResults.push({
        ...result,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
      });
    } catch (error) {
      if (isDocumentAiPageLimitError(error)) {
        throw new DocumentAiPageLimitError(
          error instanceof Error ? error.message : "Document AI page limit exceeded.",
          chunk.startPage,
          chunk.endPage
        );
      }

      console.error("[document-extraction] OCR chunk failed", {
        chunkIndex: chunk.chunkIndex,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        error: getSafeErrorForLog(error),
      });

      return {
        success: false as const,
        splitResult,
        chunkResults,
        error: `OCR could not process pages ${chunk.startPage}-${chunk.endPage}. The uploaded document was preserved. Try again or paste the text manually.`,
      };
    }
  }

  return {
    success: true as const,
    splitResult,
    chunkResults,
  };
}

export async function extractPdfWithGoogleDocumentAi({
  fileBuffer,
  mimeType,
}: OcrInput): Promise<OcrProviderResult> {
  const config = getRequiredGoogleConfig();

  if (config.error || !config.projectId || !config.location || !config.processorId) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: null,
      confidence: 0,
      error: "Google Document AI is not configured.",
    });
  }

  // TODO: Move large OCR work to an asynchronous background job if production documents regularly exceed the route execution limit.
  const client = createDocumentAiClient(config.location);
  const name = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`;
  const pdfBuffer = toBuffer(fileBuffer);
  const preferredChunkSize = getConfiguredOcrChunkSize();
  const maxOcrPages = getConfiguredMaxOcrPages();
  let splitResult: Awaited<ReturnType<typeof splitPdfIntoChunks>>;

  try {
    splitResult = await splitPdfIntoChunks(pdfBuffer, preferredChunkSize);
  } catch (error) {
    console.error("[document-extraction] PDF chunk preparation failed", {
      error: getSafeErrorForLog(error),
    });

    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: null,
      confidence: 0,
      error: "This PDF appears to be password-protected or damaged.",
    });
  }

  if (splitResult.totalPages > maxOcrPages) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: splitResult.totalPages,
      confidence: 0,
      error: `This PDF has ${splitResult.totalPages} pages. OCR is currently limited to ${maxOcrPages} pages. You can paste the text manually or upload a shorter document.`,
    });
  }

  let ocrResult:
    | Awaited<ReturnType<typeof processPdfChunksWithGoogleOcr>>
    | null = null;
  let finalChunkSize = preferredChunkSize;

  try {
    ocrResult = await processPdfChunksWithGoogleOcr({
      pdfBuffer,
      chunkSize: preferredChunkSize,
      client,
      processorName: name,
      mimeType,
    });
  } catch (error) {
    if (
      error instanceof DocumentAiPageLimitError &&
      preferredChunkSize > pageLimitFallbackChunkSize
    ) {
      console.warn(
        "Falling back to 15-page OCR chunks due to Document AI page limit.",
        {
          failedStartPage: error.startPage,
          failedEndPage: error.endPage,
        }
      );

      finalChunkSize = pageLimitFallbackChunkSize;
      try {
        ocrResult = await processPdfChunksWithGoogleOcr({
          pdfBuffer,
          chunkSize: pageLimitFallbackChunkSize,
          client,
          processorName: name,
          mimeType,
        });
      } catch (fallbackError) {
        if (fallbackError instanceof DocumentAiPageLimitError) {
          console.error(
            "[document-extraction] OCR page limit failed at fallback size",
            {
              startPage: fallbackError.startPage,
              endPage: fallbackError.endPage,
              error: getSafeErrorForLog(fallbackError),
            }
          );

          return createExtractionResult({
            success: false,
            text: "",
            method: "pdf_ocr",
            pageCount: splitResult.totalPages,
            confidence: 0,
            error: `OCR could not process pages ${fallbackError.startPage}-${fallbackError.endPage}. The uploaded document was preserved. Try again or paste the text manually.`,
          });
        }

        throw fallbackError;
      }
    } else if (error instanceof DocumentAiPageLimitError) {
      console.error("[document-extraction] OCR page limit failed at fallback size", {
        startPage: error.startPage,
        endPage: error.endPage,
        error: getSafeErrorForLog(error),
      });

      return createExtractionResult({
        success: false,
        text: "",
        method: "pdf_ocr",
        pageCount: splitResult.totalPages,
        confidence: 0,
        error: `OCR could not process pages ${error.startPage}-${error.endPage}. The uploaded document was preserved. Try again or paste the text manually.`,
      });
    } else {
      throw error;
    }
  }

  if (!ocrResult) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: splitResult.totalPages,
      confidence: 0,
      error:
        "OCR could not read this PDF. You can paste the document text manually or upload a Word version.",
    });
  }

  if (!ocrResult.success) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: ocrResult.splitResult.totalPages,
      confidence: 0,
      error: ocrResult.error,
    });
  }

  console.info("[document-extraction] Combining OCR text", {
    totalPages: ocrResult.splitResult.totalPages,
    chunks: ocrResult.splitResult.chunks.length,
    chunkSize: finalChunkSize,
  });

  const text = ocrResult.chunkResults
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const confidencePageTotal = ocrResult.chunkResults.reduce(
    (sum, chunk) => sum + (chunk.confidence === null ? 0 : chunk.pageCount),
    0
  );
  const confidence =
    confidencePageTotal > 0
      ? ocrResult.chunkResults.reduce(
          (sum, chunk) =>
            chunk.confidence === null
              ? sum
              : sum + chunk.confidence * chunk.pageCount,
          0
        ) / confidencePageTotal
      : null;

  if (!text) {
    return createExtractionResult({
      success: false,
      text: "",
      method: "pdf_ocr",
      pageCount: ocrResult.splitResult.totalPages,
      confidence: confidence ?? 0,
      error:
        "OCR could not read this PDF. You can paste the document text manually or upload a Word version.",
    });
  }

  return createExtractionResult({
    success: true,
    text,
    method: "pdf_ocr",
    pageCount: ocrResult.splitResult.totalPages,
    confidence,
  });
}

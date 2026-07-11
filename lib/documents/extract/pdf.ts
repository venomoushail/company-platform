import "server-only";

import { createRequire } from "node:module";
import { createExtractionResult } from "@/lib/documents/types";
import { extractPdfWithGoogleDocumentAi, isGoogleDocumentAiConfigured } from "@/lib/documents/ocr/googleDocumentAi";
import { evaluateExtraction } from "@/lib/documents/quality/evaluateExtraction";
import type { DocumentExtractionResult } from "@/lib/documents/types";

const require = createRequire(import.meta.url);
const maxSynchronousPdfPages = 80;

type PdfParseModule = typeof import("pdf-parse");

function toBuffer(fileBuffer: ArrayBuffer | Buffer) {
  return Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
}

function getReadablePdfParserError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("password") || message.includes("encrypted")) {
    return "This PDF appears to be password-protected or damaged.";
  }

  return "This PDF did not contain readable embedded text, so OCR was attempted.";
}

function getSafeOcrErrorForLog(error: unknown) {
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

async function extractEmbeddedPdfText(fileBuffer: ArrayBuffer | Buffer) {
  let parser: InstanceType<PdfParseModule["PDFParse"]> | null = null;

  try {
    const { PDFParse } = require("pdf-parse") as PdfParseModule;

    parser = new PDFParse({
      data: new Uint8Array(toBuffer(fileBuffer)),
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    const result = await parser.getText({ pageJoiner: "\n\n" });
    const pageTexts = result.pages.map((page) => page.text ?? "");
    const pageCount = result.total || pageTexts.length || null;

    if (pageCount && pageCount > maxSynchronousPdfPages) {
      return {
        text: result.text.trim(),
        pageTexts,
        pageCount,
        parserError: false,
        warning:
          "This PDF is large. OCR may take longer; background processing should be added before increasing limits.",
      };
    }

    return {
      text: result.text.trim(),
      pageTexts,
      pageCount,
      parserError: false,
      warning: undefined,
    };
  } catch (error) {
    return {
      text: "",
      pageTexts: [],
      pageCount: null,
      parserError: true,
      warning: getReadablePdfParserError(error),
    };
  } finally {
    await parser?.destroy();
  }
}

export async function extractPdfText(
  fileBuffer: ArrayBuffer | Buffer,
  mimeType = "application/pdf"
): Promise<DocumentExtractionResult> {
  const embedded = await extractEmbeddedPdfText(fileBuffer);
  const embeddedQuality = evaluateExtraction({
    text: embedded.text,
    pageCount: embedded.pageCount,
    pageTexts: embedded.pageTexts,
    parserError: embedded.parserError,
  });

  if (embeddedQuality.usable) {
    return createExtractionResult({
      success: true,
      text: embedded.text,
      method: "pdf_embedded_text",
      pageCount: embedded.pageCount,
      confidence: embeddedQuality.confidence,
      warning: embeddedQuality.reason ?? embedded.warning,
    });
  }

  if (!isGoogleDocumentAiConfigured()) {
    return createExtractionResult({
      success: false,
      text: embedded.text,
      method: "pdf_embedded_text",
      pageCount: embedded.pageCount,
      confidence: embeddedQuality.confidence,
      warning: embeddedQuality.reason ?? embedded.warning,
      error: "Google Document AI is not configured.",
    });
  }

  try {
    const ocrResult = await extractPdfWithGoogleDocumentAi({
      fileBuffer,
      mimeType,
    });

    if (!ocrResult.success) {
      return {
        ...ocrResult,
        warning: embeddedQuality.reason ?? ocrResult.warning,
      };
    }

    const ocrQuality = evaluateExtraction({
      text: ocrResult.text,
      pageCount: ocrResult.pageCount,
    });

    if (!ocrQuality.usable) {
      return {
        ...ocrResult,
        success: false,
        confidence: ocrQuality.confidence,
        warning: embeddedQuality.reason,
        error:
          "OCR could not read this PDF. You can paste the document text manually or upload a Word version.",
      };
    }

    return {
      ...ocrResult,
      confidence: ocrResult.confidence ?? ocrQuality.confidence,
      warning: embeddedQuality.reason,
    };
  } catch (error) {
    console.error(
      "[document-extraction] Google Document AI OCR failed",
      getSafeOcrErrorForLog(error)
    );

    return createExtractionResult({
      success: false,
      text: embedded.text,
      method: "pdf_ocr",
      pageCount: embedded.pageCount,
      confidence: embeddedQuality.confidence,
      warning: embeddedQuality.reason ?? embedded.warning,
      error:
        "OCR could not read this PDF. You can paste the document text manually or upload a Word version.",
    });
  }
}

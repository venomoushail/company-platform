import "server-only";

import { PDFDocument } from "pdf-lib";

export type PdfChunk = {
  chunkIndex: number;
  startPage: number;
  endPage: number;
  pageCount: number;
  buffer: Buffer;
};

const defaultMaxPagesPerChunk = 25;

function normalizeMaxPagesPerChunk(maxPagesPerChunk = defaultMaxPagesPerChunk) {
  if (!Number.isFinite(maxPagesPerChunk)) return defaultMaxPagesPerChunk;

  return Math.min(25, Math.max(1, Math.trunc(maxPagesPerChunk)));
}

export async function getPdfPageCount(pdfBuffer: Buffer | Uint8Array) {
  const pdf = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: false,
  });

  return pdf.getPageCount();
}

export async function splitPdfIntoChunks(
  pdfBuffer: Buffer | Uint8Array,
  maxPagesPerChunk = defaultMaxPagesPerChunk
): Promise<{
  totalPages: number;
  chunks: PdfChunk[];
}> {
  const sourcePdf = await PDFDocument.load(pdfBuffer, {
    ignoreEncryption: false,
  });
  const totalPages = sourcePdf.getPageCount();
  const normalizedMaxPagesPerChunk =
    normalizeMaxPagesPerChunk(maxPagesPerChunk);
  const chunks: PdfChunk[] = [];

  for (let startIndex = 0; startIndex < totalPages; startIndex += normalizedMaxPagesPerChunk) {
    const endIndex = Math.min(
      startIndex + normalizedMaxPagesPerChunk,
      totalPages
    );
    const chunkPdf = await PDFDocument.create();
    const pageIndexes = Array.from(
      { length: endIndex - startIndex },
      (_, offset) => startIndex + offset
    );
    const copiedPages = await chunkPdf.copyPages(sourcePdf, pageIndexes);

    for (const page of copiedPages) {
      chunkPdf.addPage(page);
    }

    const chunkBytes = await chunkPdf.save();

    chunks.push({
      chunkIndex: chunks.length,
      startPage: startIndex + 1,
      endPage: endIndex,
      pageCount: endIndex - startIndex,
      buffer: Buffer.from(chunkBytes),
    });
  }

  return { totalPages, chunks };
}

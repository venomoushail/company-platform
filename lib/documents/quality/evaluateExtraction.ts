import "server-only";

export type ExtractionQualityInput = {
  text: string;
  pageCount: number | null;
  pageTexts?: string[];
  parserError?: boolean;
};

export type ExtractionQualityResult = {
  usable: boolean;
  confidence: number;
  reason?: string;
};

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function getRepeatedGarbagePenalty(text: string) {
  const fragments = text.match(/[^\p{L}\p{N}\s]{4,}/gu) ?? [];
  const counts = new Map<string, number>();

  for (const fragment of fragments) {
    counts.set(fragment, (counts.get(fragment) ?? 0) + 1);
  }

  return Array.from(counts.values()).some((count) => count >= 4) ? 0.15 : 0;
}

export function evaluateExtraction({
  text,
  pageCount,
  pageTexts,
  parserError = false,
}: ExtractionQualityInput): ExtractionQualityResult {
  if (parserError) {
    return {
      usable: false,
      confidence: 0,
      reason: "The PDF parser could not read this document.",
    };
  }

  const trimmedText = text.trim();
  const characterCount = trimmedText.length;
  const effectivePageCount = Math.max(pageCount ?? pageTexts?.length ?? 1, 1);
  const replacementCount = countMatches(trimmedText, /\uFFFD/g);
  const alphaNumericCount = countMatches(trimmedText, /[\p{L}\p{N}]/gu);
  const whitespaceCount = countMatches(trimmedText, /\s/g);
  const replacementRatio = characterCount ? replacementCount / characterCount : 1;
  const alphaNumericRatio = characterCount ? alphaNumericCount / characterCount : 0;
  const symbolRatio = characterCount
    ? (characterCount - alphaNumericCount - whitespaceCount) / characterCount
    : 1;
  const charactersPerPage = characterCount / effectivePageCount;
  const weakPages =
    pageTexts?.filter((pageText) => {
      const page = pageText.trim();
      const usableCharacters = countMatches(page, /[\p{L}\p{N}]/gu);

      return page.length > 0 && usableCharacters < 25;
    }).length ?? 0;
  const emptyPages =
    pageTexts?.filter((pageText) => pageText.trim().length === 0).length ?? 0;

  if (characterCount === 0) {
    return {
      usable: false,
      confidence: 0,
      reason: "No embedded text was found.",
    };
  }

  let confidence = 1;

  if (characterCount < 80 && effectivePageCount > 1) confidence -= 0.45;
  if (characterCount < 40 && effectivePageCount === 1) confidence -= 0.18;
  if (charactersPerPage < 60 && effectivePageCount > 1) confidence -= 0.25;
  if (replacementRatio > 0.03) confidence -= 0.35;
  if (alphaNumericRatio < 0.45) confidence -= 0.3;
  if (symbolRatio > 0.35) confidence -= 0.2;
  if (pageTexts?.length) {
    confidence -= Math.min(0.25, (weakPages / effectivePageCount) * 0.2);
    confidence -= Math.min(0.25, (emptyPages / effectivePageCount) * 0.25);
  }
  confidence -= getRepeatedGarbagePenalty(trimmedText);

  const normalizedConfidence = clampConfidence(confidence);

  if (normalizedConfidence < 0.55) {
    return {
      usable: false,
      confidence: normalizedConfidence,
      reason:
        "This PDF did not contain readable embedded text, so OCR was attempted.",
    };
  }

  return {
    usable: true,
    confidence: normalizedConfidence,
    reason: normalizedConfidence < 0.75 ? "Extraction confidence is low." : undefined,
  };
}

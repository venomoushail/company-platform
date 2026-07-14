const lowercaseWords = new Set(["and", "or", "of", "to", "the"]);

export function formatCategoryLabel(
  category: string | null | undefined
): string {
  const words = (category ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "Uncategorized";

  return words
    .map((word, index) => {
      const lowercaseWord = word.toLowerCase();

      if (index > 0 && lowercaseWords.has(lowercaseWord)) {
        return lowercaseWord;
      }

      return `${lowercaseWord.charAt(0).toUpperCase()}${lowercaseWord.slice(1)}`;
    })
    .join(" ");
}

export function normalizeCategorySlug(
  category: string | null | undefined
): string {
  return (category ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, " ")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

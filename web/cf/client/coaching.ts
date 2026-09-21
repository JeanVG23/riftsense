export const NEGATIVE_FEEDBACK_TAGS = [
  "asymetrie",
  "stat-inventee",
  "profondeur-en-faute",
  "trop-vague",
  "non-actionnable",
  "autre",
] as const;

function cleanInsight(text: unknown): string {
  return String(text || "").trim()
    .replace(/^(?:Erreur|Mistake)\s*\d+\s*:\s*/i, "")
    .replace(/^(?:Force|Strength)\s*\d+\s*:\s*/i, "");
}

export function insightTitle(text: unknown): string {
  const cleaned = cleanInsight(text);
  const separator = cleaned.search(/[:—–-]/);
  if (separator > 5 && separator < 80) return cleaned.slice(0, separator).trim();
  const sentence = cleaned.indexOf(". ");
  if (sentence > 5 && sentence < 85) return cleaned.slice(0, sentence).trim();
  if (cleaned.length > 80) {
    const space = cleaned.lastIndexOf(" ", 75);
    return `${cleaned.slice(0, space > 25 ? space : 70)}…`;
  }
  return cleaned;
}

export function insightBody(text: unknown): string {
  const cleaned = cleanInsight(text);
  const separator = cleaned.search(/[:—–-]/);
  if (separator > 5 && separator < 80) return cleaned.slice(separator + 1).trim();
  const sentence = cleaned.indexOf(". ");
  if (sentence > 5 && sentence < 85) return cleaned.slice(sentence + 2).trim();
  return "";
}

export function outcomeLabel(outcome: string): string {
  return outcome === "loss" ? "Losses" : outcome === "win" ? "Wins" : "Overall";
}

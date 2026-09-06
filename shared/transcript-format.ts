const SENTENCE_END = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;

export function formatTranscriptParagraphs(value: string, sentencesPerParagraph = 4): string {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return "";

  const sentences = normalized
    .replace(/\n+/g, " ")
    .match(SENTENCE_END)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];

  if (sentences.length < 2) return normalized;

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(index, index + sentencesPerParagraph).join(" "));
  }
  return paragraphs.join("\n\n");
}
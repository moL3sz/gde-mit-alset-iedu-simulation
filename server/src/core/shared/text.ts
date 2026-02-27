export const limitToSentences = (value: string, maxSentences: number): string => {
  const text = value.replace(/\s+/g, ' ').trim();

  if (!text) {
    return '';
  }

  if (maxSentences <= 0) {
    return '';
  }

  const sentences =
    text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  if (sentences.length === 0) {
    return text;
  }

  return sentences.slice(0, maxSentences).join(' ').trim();
};

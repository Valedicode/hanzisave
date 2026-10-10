// Asks the card model which parts of a fixed expression are real words worth a card of their own.
// The HSK lists and the learner's deck miss words like 绑定, 时差 and 松鼠; fragments like 回事 or 员 must stay out.

export const WORD_CHECK_SYSTEM = `You help build a vocabulary deck for a learner of Mandarin. You get a list of Chinese strings that were cut out of longer expressions. Decide for each whether it is a real, standalone Mandarin word or fixed expression that a learner could study as a vocabulary item (for example 绑定, 时差, 松鼠). Reject fragments that are not words on their own: bound characters or suffixes (员, 性), leftover pieces of a phrase (回事, 蒙蒙), and strings that only make sense inside the original phrase.
Reply with ONLY a JSON object, with no code fence and no commentary: {"words": ["...", "..."]} listing the strings you accept, copied exactly as given. Leave out the ones you reject.`;

export const buildWordCheckPrompt = (candidates: string[]) => candidates.join("\n");

// The accepted words, limited to the ones that were asked about; null when the reply is unusable.
export function parseWordCheck(text: string, candidates: string[]): string[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { words?: unknown };
    if (!Array.isArray(parsed.words)) return null;
    const asked = new Set(candidates);
    return [...new Set(parsed.words.filter((w): w is string => typeof w === "string" && asked.has(w)))];
  } catch {
    return null;
  }
}

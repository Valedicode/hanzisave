import { GlossSchema, type Gloss, type GlossRequest } from "./gloss-schema";

// The gloss runs on the same open-weight model as the cards, which may not support structured
// output, so the reply is plain JSON that is parsed and checked here.
export const GLOSS_SYSTEM = `You help an English-speaking learner of Mandarin. Given a word and the sentence it appears in, reply with ONLY a JSON object, with no code fence and no commentary:
{"pinyin": "...", "gloss": "...", "example": "...", "examplePinyin": "...", "exampleTranslation": "..."}
- pinyin: the word with tone marks, the syllables of one word joined (e.g. "diànnǎo").
- gloss: a short English meaning, at most 6 words, of the word as used in the given sentence.
- example: a new, natural sentence in Chinese of 4 to 14 hanzi that uses the word. It must differ from the given sentence.
- examplePinyin: the pinyin of the example sentence, with tone marks.
- exampleTranslation: the English translation of the example sentence.`;

export function buildGlossPrompt(req: GlossRequest): string {
  return `word: ${req.word}\nsentence: ${req.sentence}`;
}

// Returns the gloss, or null when the reply is not usable JSON of the right shape.
export function parseGloss(text: string): Gloss | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = GlossSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

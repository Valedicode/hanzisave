import lexiconData from "@/public/lexicon.json";

export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface LexiconEntry {
  word: string;
  level: HskLevel;
  pinyin: string;
  gloss: string;
}

export const MAX_WORD_LEN = 4;

const entries = lexiconData as LexiconEntry[];

const byWord = new Map<string, LexiconEntry>(entries.map((e) => [e.word, e]));

export function lookup(word: string): LexiconEntry | undefined {
  return byWord.get(word);
}

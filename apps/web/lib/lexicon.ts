import lexiconData from "@/public/lexicon.json";
import extraData from "@/public/hsk30-extra.json";

// 7 stands for the whole HSK 3.0 7-9 band.
export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LexiconEntry {
  word: string;
  level: HskLevel;
  pinyin?: string;
  gloss?: string;
}

export const MAX_WORD_LEN = 4;

const entries = lexiconData as LexiconEntry[];

const byWord = new Map<string, LexiconEntry>(entries.map((e) => [e.word, e]));

// Words from the HSK 3.0 list that the 1-6 lexicon does not have (built by scripts/build-hsk30-index.mjs).
// They come second, so a word in both keeps the level of the 1-6 lexicon.
const extra = extraData as Record<string, HskLevel>;

export function lookup(word: string): LexiconEntry | undefined {
  const entry = byWord.get(word);
  if (entry) return entry;
  const level = extra[word];
  return level === undefined ? undefined : { word, level };
}

export const levelLabel = (level: number) => (level >= 7 ? "HSK 7–9" : `HSK ${level}`);

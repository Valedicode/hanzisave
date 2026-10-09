// Finds the words in a text that the learner doesn't have yet.

import { splitSentences } from "./analyze";
import { lookup, type HskLevel } from "./lexicon";
import { segment } from "./segment";

export interface NewWord {
  surface: string;
  level: HskLevel | null; // HSK level from the lexicon; null = not in the HSK list
  count: number; // occurrences in the text
  sentence: string; // first sentence it appears in, used as context for the card
}

export interface ScanOptions {
  known: ReadonlySet<string>; // words the learner already has
  levelFloor?: number; // also treat HSK words at or below this level as known
}

export interface ScanResult {
  newWords: NewWord[]; // in order of first appearance
  totalWords: number; // distinct word occurrences considered (Han words only)
  knownWords: number;
}

const ALL_HAN = /^\p{Script=Han}+$/u;

// The segmenter keeps some strings together that are really two easy words
// (三天, 到了, 一起去). A short token that splits cleanly into pieces the
// learner already has, or that sit at or below the level floor, is not a new
// word. Four-character strings are left alone so idioms still count as new.
const MAX_TRANSPARENT_LEN = 3;

function isTransparent(surface: string, known: ReadonlySet<string>, levelFloor: number): boolean {
  if (surface.length < 2 || surface.length > MAX_TRANSPARENT_LEN) return false;
  const easy = (piece: string) => known.has(piece) || ((lookup(piece)?.level ?? Infinity) <= levelFloor);
  let i = 0;
  while (i < surface.length) {
    let len = surface.length - i;
    while (len > 0 && !easy(surface.slice(i, i + len))) len--;
    if (len === 0) return false;
    i += len;
  }
  return true;
}

export function scanText(text: string, { known, levelFloor = 0 }: ScanOptions): ScanResult {
  const found = new Map<string, NewWord>();
  let totalWords = 0;
  let knownWords = 0;

  for (const sentence of splitSentences(text)) {
    for (const word of segment(sentence, { extra: known })) {
      if (!ALL_HAN.test(word.surface)) continue;
      totalWords++;
      if (
        known.has(word.surface) ||
        (word.level !== null && word.level <= levelFloor) ||
        (word.level === null && isTransparent(word.surface, known, levelFloor))
      ) {
        knownWords++;
        continue;
      }
      const existing = found.get(word.surface);
      if (existing) existing.count++;
      else found.set(word.surface, { surface: word.surface, level: word.level, count: 1, sentence });
    }
  }

  return { newWords: [...found.values()], totalWords, knownWords };
}

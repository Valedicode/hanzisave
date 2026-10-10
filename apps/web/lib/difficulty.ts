// How hard a text is, from the HSK levels of its words and of the grammar points found in it.
// A lookup rule, not a classifier: the word level is the lowest level that covers most of the words,
// the grammar level is the highest level of any point found.

import type { GrammarHit } from "./grammar-detect";
import type { GrammarPoint } from "./grammar";
import type { MarkedSentence } from "./scan";

// A text counts as level L when this share of its HSK words is at level L or below; the rest is the tail
// of harder words that a reader can look up. Below MIN_WORDS there is too little text to say anything.
export const COVERAGE = 0.9;
export const MIN_WORDS = 8;

export interface WordDifficulty {
  level: number; // 1-6, 7 for the whole 7-9 band
  covered: number; // share of the HSK words at that level or below
  words: number; // HSK words counted (every occurrence)
}

export function wordDifficulty(sentences: readonly MarkedSentence[]): WordDifficulty | null {
  const perLevel = new Map<number, number>();
  let listed = 0;
  for (const { words: ws } of sentences) {
    for (const w of ws) {
      if (w.status === "other") continue;
      if (w.level === null) continue;
      listed++;
      perLevel.set(w.level, (perLevel.get(w.level) ?? 0) + 1);
    }
  }
  if (listed < MIN_WORDS) return null;
  let sum = 0;
  for (const level of [...perLevel.keys()].sort((a, b) => a - b)) {
    sum += perLevel.get(level)!;
    if (sum / listed >= COVERAGE) return { level, covered: sum / listed, words: listed };
  }
  return null; // unreachable: the top level always reaches 100%
}

export interface GrammarDifficulty {
  level: number;
  points: GrammarPoint[]; // the points that sit at that level
}

export function grammarDifficulty(hits: readonly GrammarHit[]): GrammarDifficulty | null {
  if (hits.length === 0) return null;
  const level = Math.max(...hits.map((h) => h.point.level));
  return { level, points: hits.filter((h) => h.point.level === level).map((h) => h.point) };
}

// The level the text reads at: whichever of words and grammar is harder.
export function textLevel(words: WordDifficulty | null, grammar: GrammarDifficulty | null): number | null {
  const levels = [words?.level, grammar?.level].filter((l): l is number => l !== undefined);
  return levels.length > 0 ? Math.max(...levels) : null;
}

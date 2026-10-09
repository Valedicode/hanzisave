import { segment, type Word } from "./segment";
import { levelSentence } from "./level";
import type { HskLevel } from "./lexicon";

export interface AnalyzedWord extends Word {
  lexiconId?: string;
  flagged: boolean;
}

export interface AnalyzedSentence {
  id: string;
  text: string;
  level: HskLevel | null;
  source: "heuristic";
  words: AnalyzedWord[];
}

export interface AnalyzeSummary {
  dominantLevels: [number, number];
  flaggedCount: number;
  coverage: number;
}

export interface AnalyzeResult {
  sentences: AnalyzedSentence[];
  summary: AnalyzeSummary;
}

// Splits on Chinese/Western sentence terminators and newlines, keeping the
// terminator with the sentence it ends.
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[。！？!?\n])/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function analyze(text: string, learnerLevel: HskLevel = 3, k = 2): AnalyzeResult {
  const sentenceTexts = splitSentences(text);
  let flaggedCount = 0;
  let knownWords = 0;
  let totalWords = 0;
  const levelCounts = new Map<number, number>();

  const sentences: AnalyzedSentence[] = sentenceTexts.map((sentenceText, i) => {
    const words = segment(sentenceText);
    const level = levelSentence(words.map((w) => w.level), k);

    const analyzedWords: AnalyzedWord[] = words.map((w) => {
      const isWordChar = /\p{Script=Han}/u.test(w.surface);
      if (!isWordChar) return { ...w, flagged: false };
      totalWords++;
      if (w.level !== null) knownWords++;
      const flagged = w.level === null || w.level > learnerLevel;
      if (flagged) flaggedCount++;
      if (w.level !== null) levelCounts.set(w.level, (levelCounts.get(w.level) ?? 0) + 1);
      return { ...w, flagged };
    });

    return {
      id: `s${i}`,
      text: sentenceText,
      level,
      source: "heuristic",
      words: analyzedWords,
    };
  });

  const dominant = [...levelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([lv]) => lv);
  while (dominant.length < 2) dominant.push(dominant[0] ?? 1);

  return {
    sentences,
    summary: {
      dominantLevels: dominant as [number, number],
      flaggedCount,
      coverage: totalWords ? knownWords / totalWords : 0,
    },
  };
}

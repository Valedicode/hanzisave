import type { HskLevel } from "./lexicon";

// Mirrors ml/src/hanzisave_ml/silver_label.py: SentenceStats.supported_max /
// p90_level, kept in sync by hand since the app and the ML pipeline are
// separate implementations of the same rule.
export function p90Level(levels: HskLevel[]): HskLevel | null {
  if (levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.9 * (sorted.length - 1)));
  return sorted[idx];
}

export function supportedMax(levels: HskLevel[], k = 2): HskLevel | null {
  const counts = new Map<HskLevel, number>();
  for (const lv of levels) counts.set(lv, (counts.get(lv) ?? 0) + 1);
  const supported = [...counts.entries()].filter(([, n]) => n >= k).map(([lv]) => lv);
  if (supported.length === 0) return p90Level(levels);
  return Math.max(...supported) as HskLevel;
}

export function levelSentence(levels: (HskLevel | null)[], k = 2): HskLevel | null {
  const known = levels.filter((lv): lv is HskLevel => lv !== null);
  return supportedMax(known, k);
}

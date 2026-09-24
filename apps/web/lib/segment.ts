import { lookup, MAX_WORD_LEN, type HskLevel } from "./lexicon";

export interface Word {
  surface: string;
  start: number;
  end: number;
  level: HskLevel | null; // null = OOV (dashed)
}

// Intl.Segmenter gives ICU word boundaries, then we greedily re-merge runs of
// word-like segments against the lexicon (longest match wins) so multi-char
// HSK words split by ICU (e.g. 电脑 -> 电 + 脑) come back together.
export function segment(text: string): Word[] {
  const seg = new Intl.Segmenter("zh", { granularity: "word" });
  const raw = [...seg.segment(text)];
  const words: Word[] = [];

  let i = 0;
  while (i < raw.length) {
    const tok = raw[i];
    if (!tok.isWordLike) {
      words.push({ surface: tok.segment, start: tok.index, end: tok.index + tok.segment.length, level: null });
      i++;
      continue;
    }

    let bestLen = 1; // in segmenter tokens
    let bestEntry = lookup(tok.segment);
    let combined = tok.segment;
    for (let len = 2; i + len <= raw.length && combined.length < MAX_WORD_LEN; len++) {
      const next = raw[i + len - 1];
      if (!next.isWordLike) break;
      combined += next.segment;
      const entry = lookup(combined);
      if (entry) {
        bestLen = len;
        bestEntry = entry;
      }
    }

    const start = tok.index;
    const surface = raw.slice(i, i + bestLen).map((t) => t.segment).join("");
    words.push({ surface, start, end: start + surface.length, level: bestEntry?.level ?? null });
    i += bestLen;
  }

  return words;
}

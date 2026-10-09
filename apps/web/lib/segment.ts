import { lookup, MAX_WORD_LEN, type HskLevel } from "./lexicon";

export interface Word {
  surface: string;
  start: number;
  end: number;
  level: HskLevel | null; // null = OOV (dashed)
}

export interface SegmentOptions {
  // Extra words to keep whole, e.g. the learner's own vocabulary. They merge
  // like lexicon words but carry no HSK level.
  extra?: ReadonlySet<string>;
}

const EXTRA_MAX_LEN = 8;

// Intl.Segmenter gives ICU word boundaries, then we greedily re-merge runs of
// word-like segments against the lexicon (longest match wins) so multi-char
// HSK words split by ICU (e.g. 电脑 -> 电 + 脑) come back together.
export function segment(text: string, options: SegmentOptions = {}): Word[] {
  const extra = options.extra;
  const maxLen = extra && extra.size > 0 ? EXTRA_MAX_LEN : MAX_WORD_LEN;
  const isWord = (w: string) => lookup(w) !== undefined || extra?.has(w) === true;
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
    let combined = tok.segment;
    for (let len = 2; i + len <= raw.length && combined.length < maxLen; len++) {
      const next = raw[i + len - 1];
      if (!next.isWordLike) break;
      combined += next.segment;
      if (isWord(combined)) bestLen = len;
    }

    const start = tok.index;
    const surface = raw.slice(i, i + bestLen).map((t) => t.segment).join("");
    words.push({ surface, start, end: start + surface.length, level: lookup(surface)?.level ?? null });
    i += bestLen;
  }

  return words;
}

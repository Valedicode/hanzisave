// Decides whether a combined Anki front ("A / B") is one card or several,
// using the official HSK 3.0 word list (ivankra/hsk30) as the authority:
//   - parts that are forms of the SAME list row (爸爸|爸, 有（一）些) are one
//     entry -> keep together
//   - parts that resolve to DIFFERENT rows are separate entries -> split
//   - anything else (not decidable from the list) is only a proposal: a
//     substring heuristic (淘宝 / 淘宝网 -> variant) the user must approve
// A part that differs from another in level or POS is necessarily a different
// row, so the "reject if level/POS differ" rule is subsumed by the second case.

import { looksLikeGrammar, splitFront } from "./anki-import";

export interface Hsk30Index {
  entries: Record<string, [level: string, pos: string]>;
  forms: Record<string, string[]>;
}

export interface SplitPart {
  text: string;
  ids: string[]; // official row ids this form belongs to ([] = not in the list)
  grammar: boolean;
}

export type SplitStatus = "official" | "proposal";

export interface SplitPlan {
  action: "none" | "keep" | "split";
  status: SplitStatus; // "proposal" => needs the user's approval
  reason: string;
  parts: SplitPart[];
}

export function planSplit(front: string, index: Hsk30Index): SplitPlan {
  const { parts: texts, kind } = splitFront(front);
  const parts = texts.map((text) => ({
    text,
    ids: index.forms[text] ?? [],
    grammar: looksLikeGrammar(text),
  }));
  if (parts.length < 2) {
    return { action: "none", status: "official", reason: "single item", parts };
  }

  const resolved = parts.filter((p) => p.ids.length > 0);

  if (resolved.length === parts.length) {
    const shared = parts[0].ids.filter((id) => parts.every((p) => p.ids.includes(id)));
    if (shared.length > 0) {
      return { action: "keep", status: "official", reason: `one HSK 3.0 entry (${shared[0]})`, parts };
    }
  }

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (!a.ids.some((id) => b.ids.includes(id))) {
        return {
          action: "split",
          status: "official",
          reason: `separate HSK 3.0 entries (${a.text} ${a.ids[0]}, ${b.text} ${b.ids[0]})`,
          parts,
        };
      }
    }
  }

  if (parts.some((p) => p.grammar) && parts.some((p) => !p.grammar)) {
    return { action: "split", status: "proposal", reason: "mixes a word with a grammar pattern", parts };
  }

  const unlisted = parts.filter((p) => p.ids.length === 0).map((p) => p.text);
  const why = `not decidable from the list (not listed: ${unlisted.join(", ")})`;
  return kind === "variant"
    ? { action: "keep", status: "proposal", reason: `${why}; one contains the other, likely a variant`, parts }
    : { action: "split", status: "proposal", reason: `${why}; no overlap, likely separate words`, parts };
}

export function levelAndPos(index: Hsk30Index, id: string): { level: string; pos: string } | undefined {
  const e = index.entries[id];
  return e ? { level: e[0], pos: e[1] } : undefined;
}

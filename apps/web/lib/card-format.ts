import type { CardType } from "./llm/types";

// Labels the card spec requires, in order. The app parses a Back by these
// labels, so a card missing one is rejected before it reaches the user.
const WORD_LABELS = [
  "Pinyin:",
  "Jyutping:",
  "Used in Cantonese:",
  "Part of speech:",
  "Register:",
  "Translation:",
  "Patterns:",
  "Example:",
];

const GRAMMAR_LABELS = [
  "Pattern:",
  "Pinyin:",
  "Jyutping:",
  "Used in Cantonese:",
  "Register:",
  "Meaning:",
  "Structure:",
  "Watch out:",
  "Compare:",
  "Example:",
];

// Fields a card is useless without; "unsure" there means the model gave up.
const CORE_LABELS = ["Pinyin:", "Translation:", "Meaning:"];

export interface FormatCheck {
  ok: boolean;
  problems: string[];
}

export function checkCardFormat(back: string, type: CardType): FormatCheck {
  const problems: string[] = [];
  const lines = back.split("\n").map((l) => l.trim());
  const required = type === "grammar" ? GRAMMAR_LABELS : WORD_LABELS;

  for (const label of required) {
    if (!lines.some((l) => l.startsWith(label))) problems.push(`missing ${label}`);
  }
  if (type === "grammar" && lines.filter((l) => l.startsWith("Example:")).length < 2) {
    problems.push("grammar card needs two Example lines");
  }
  for (const label of CORE_LABELS) {
    const line = lines.find((l) => l.startsWith(label));
    if (line && /^unsure\.?$/i.test(line.slice(label.length).trim())) problems.push(`${label} is unsure`);
  }
  if (/```/.test(back)) problems.push("contains a code fence");
  if (/^\s*(\*\*|#{1,3}\s)/m.test(back)) problems.push("contains markdown");
  return { ok: problems.length === 0, problems };
}

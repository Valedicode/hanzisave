// Parser for Anki "Notes in Plain Text" exports (tab-separated, optional
// `#key:value` header lines, HTML in fields, CSV-style quoting).

export type NoteFormat = "old" | "intermediate" | "current";
export type SplitKind = "none" | "pair" | "variant";

export interface ImportedNote {
  row: number; // 1-based position among data rows
  front: string; // cleaned Front (plain text)
  frontParts: string[]; // front split on "/" — equals [front] when SplitKind is none
  splitKind: SplitKind;
  isGrammar: boolean;
  format: NoteFormat;
  backText: string; // Back with <br> -> \n, tags stripped, entities decoded
  tags: string;
}

export interface ParsedDeck {
  headers: Record<string, string>;
  notes: ImportedNote[];
  skipped: number; // blank rows
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// RFC-4180-style tab-separated parser: a field starting with `"` runs until the
// closing quote (`""` is an escaped quote) and may contain tabs and newlines.
export function parseTsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  const n = input.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = input[i];
    if (c === '"' && field === "") {
      i++;
      while (i < n) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        field += input[i++];
      }
      continue;
    }
    if (c === "\t") {
      endField();
      i++;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      i++;
      endRow();
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

export function detectFormat(backText: string): NoteFormat {
  if (/^Patterns:|^Structure:/m.test(backText)) return "current";
  // Several ad-hoc earlier layouts mention Jyutping without the exact label.
  if (/Jyutping/i.test(backText)) return "intermediate";
  return "old";
}

const GRAMMAR_FRONT = /…|\.{3}|⋯|\+|[A-Z]\s*[+＋]|字句|句型/;

export function looksLikeGrammar(front: string): boolean {
  return GRAMMAR_FRONT.test(front);
}

// "A / B": a "variant" when one side contains the other (淘宝 / 淘宝网 — same
// thing, keep as one card); otherwise a "pair" of different words to split.
export function splitFront(front: string): { parts: string[]; kind: SplitKind } {
  const parts = front
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return { parts: [front], kind: "none" };
  const variant = parts.some((a, i) => parts.some((b, j) => i !== j && b.includes(a)));
  return { parts, kind: variant ? "variant" : "pair" };
}

export function parseAnkiExport(input: string): ParsedDeck {
  const headers: Record<string, string> = {};
  const lines = input.replace(/^﻿/, "").split(/\r?\n/);
  let start = 0;
  while (start < lines.length && lines[start].startsWith("#")) {
    const m = /^#([^:]+):(.*)$/.exec(lines[start]);
    if (m) headers[m[1].trim()] = m[2].trim();
    start++;
  }

  const rows = parseTsv(lines.slice(start).join("\n"));
  const notes: ImportedNote[] = [];
  let skipped = 0;

  for (const cols of rows) {
    const front = htmlToText(cols[0] ?? "");
    if (!front) {
      skipped++;
      continue;
    }
    const backText = htmlToText(cols[1] ?? "");
    const { parts, kind } = splitFront(front);
    notes.push({
      row: notes.length + 1,
      front,
      frontParts: parts,
      splitKind: kind,
      isGrammar: looksLikeGrammar(front),
      format: detectFormat(backText),
      backText,
      tags: (cols[2] ?? "").trim(),
    });
  }
  return { headers, notes, skipped };
}

export interface DeckSummary {
  total: number;
  byFormat: Record<NoteFormat, number>;
  pairs: number;
  variants: number;
  grammar: number;
  empty: number;
}

export function summarize(deck: ParsedDeck): DeckSummary {
  const s: DeckSummary = {
    total: deck.notes.length,
    byFormat: { old: 0, intermediate: 0, current: 0 },
    pairs: 0,
    variants: 0,
    grammar: 0,
    empty: deck.skipped,
  };
  for (const n of deck.notes) {
    s.byFormat[n.format]++;
    if (n.splitKind === "pair") s.pairs++;
    if (n.splitKind === "variant") s.variants++;
    if (n.isGrammar) s.grammar++;
  }
  return s;
}

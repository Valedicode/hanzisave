// Helpers for the deck rewrite: strip the model's review note from a card and
// export approved cards as an Anki "Notes in Plain Text" file (same shape as
// the deck the user exports, so Anki can update notes in place).

export interface RewrittenBack {
  back: string;
  changed?: string; // factual correction the model reported, shown for review
}

// The spec has the model report corrections as a final `Changed:` line.
export function splitChanged(raw: string): RewrittenBack {
  const lines = raw.trim().split("\n");
  const idx = lines.findLastIndex((l) => l.startsWith("Changed:"));
  if (idx === -1) return { back: raw.trim() };
  const changed = lines[idx].slice("Changed:".length).trim();
  const back = lines.filter((_, i) => i !== idx).join("\n").trim();
  return changed ? { back, changed } : { back };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Plain card text -> Anki HTML field (the export has `#html:true`).
export function toHtmlField(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

// A TSV field is quoted when it holds a tab, newline or quote; quotes double.
function tsvField(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface ExportCard {
  front: string;
  back: string;
  type: "word" | "grammar";
  tags: string;
}

export interface AnkiExport {
  tsv: string;
  count: number;
  skippedDuplicates: string[]; // fronts left out because an earlier card had the same front
}

export function buildAnkiTsv(cards: ExportCard[]): AnkiExport {
  const seen = new Set<string>();
  const skippedDuplicates: string[] = [];
  const rows: string[] = [];
  for (const c of cards) {
    if (seen.has(c.front)) {
      skippedDuplicates.push(c.front);
      continue;
    }
    seen.add(c.front);
    const tags = [c.tags, c.type === "grammar" ? "grammar" : ""].filter(Boolean).join(" ");
    rows.push([tsvField(toHtmlField(c.front)), tsvField(toHtmlField(c.back)), tsvField(tags)].join("\t"));
  }
  const header = ["#separator:tab", "#html:true", "#tags column:3"];
  return { tsv: [...header, ...rows].join("\n") + "\n", count: rows.length, skippedDuplicates };
}

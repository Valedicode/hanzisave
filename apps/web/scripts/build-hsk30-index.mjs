// Converts ml/data/lexicon/hsk30.csv (ivankra/hsk30) -> apps/web/public/hsk30-index.json
// Run: node scripts/build-hsk30-index.mjs
//
// Index shape: { entries: { [id]: [level, pos] }, forms: { [surface]: id[] } }
// A row's Simplified column may list true variants with "|" (爸爸|爸) or
// with parentheses (有（一）些); every form of a row maps to that row's id.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../../ml/data/lexicon/hsk30.csv");
const OUT = path.resolve(__dirname, "../public/hsk30-index.json");

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function formsOf(simplified) {
  const out = new Set();
  for (const piece of simplified.split("|")) {
    const without = piece.replace(/[（(][^）)]*[）)]/g, "").trim();
    const inlined = piece.replace(/[（()）]/g, "").trim();
    if (without) out.add(without);
    if (inlined) out.add(inlined);
  }
  return [...out];
}

const rows = parseCSV(fs.readFileSync(SRC, "utf8"));
const header = rows[0];
const col = (name) => header.indexOf(name);
const [iId, iSimp, iPos, iLevel] = ["ID", "Simplified", "POS", "Level"].map(col);

const entries = {};
const forms = {};
for (const r of rows.slice(1)) {
  if (!r[iId]) continue;
  entries[r[iId]] = [r[iLevel], r[iPos]];
  for (const f of formsOf(r[iSimp])) (forms[f] ??= []).push(r[iId]);
}

fs.writeFileSync(OUT, JSON.stringify({ entries, forms }));
console.log(`Wrote ${Object.keys(entries).length} entries / ${Object.keys(forms).length} forms to ${OUT}`);

// Converts ml/data/lexicon/hsk30.csv (ivankra/hsk30) -> apps/web/public/hsk30-index.json
// and apps/web/public/hsk30-extra.json (words the HSK 1-6 lexicon lacks, for scanning).
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
const OUT_EXTRA = path.resolve(__dirname, "../public/hsk30-extra.json");
const LEXICON = path.resolve(__dirname, "../public/lexicon.json");

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
const [iId, iSimp, iPos, iLevel, iVariants] = ["ID", "Simplified", "POS", "Level", "Variants"].map(col);

const entries = {};
const forms = {};
for (const r of rows.slice(1)) {
  if (!r[iId]) continue;
  entries[r[iId]] = [r[iLevel], r[iPos]];
  for (const f of formsOf(r[iSimp])) (forms[f] ??= []).push(r[iId]);
}

fs.writeFileSync(OUT, JSON.stringify({ entries, forms }));
console.log(`Wrote ${Object.keys(entries).length} entries / ${Object.keys(forms).length} forms to ${OUT}`);

// ---- extra words for scanning: real words only, with a level, that lexicon.json does not have.
// formsOf() above also joins a bracketed example onto its stem (们（朋友们） -> 们朋友们), which is
// right for matching a deck front but not for a word. Here a one-character bracket is an optional
// character (有（一）些 -> 有些, 有一些) and a longer one is only an example (第（第二）), where the
// row's Variants column already lists the real forms.
const HAN_WORD = /^\p{Script=Han}{1,4}$/u;

function wordForms(piece) {
  const m = /^(.*?)[（(]([^）)]*)[）)](.*)$/.exec(piece.trim());
  if (!m) return [piece.trim()];
  const [, before, inner, after] = m;
  return inner.length === 1 ? [before + after, before + inner + after] : [before + after];
}

function rowWords(r) {
  let variants = [];
  try {
    variants = r[iVariants] ? JSON.parse(r[iVariants]) : [];
  } catch {
    // an unreadable Variants cell: fall back to the Simplified column
  }
  const simplified = variants.length ? variants.map((v) => v.Simplified ?? "") : [r[iSimp]];
  return simplified.flatMap((cell) => cell.split("|")).flatMap(wordForms).filter((w) => HAN_WORD.test(w));
}

const lexicon = new Set(JSON.parse(fs.readFileSync(LEXICON, "utf8")).map((e) => e.word));
const extra = {};
for (const r of rows.slice(1)) {
  if (!r[iId] || /^(Prefix|Suffix)$/.test(r[iPos])) continue;
  const level = parseInt(r[iLevel], 10); // "7-9" -> 7: the whole 7-9 band is one level here
  if (!level) continue;
  for (const w of rowWords(r)) if (!lexicon.has(w) && !(extra[w] <= level)) extra[w] = level;
}
fs.writeFileSync(OUT_EXTRA, JSON.stringify(extra));
console.log(`Wrote ${Object.keys(extra).length} extra words to ${OUT_EXTRA}`);

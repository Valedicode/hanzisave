// Converts ml/data/lexicon/hsk.csv -> apps/web/public/lexicon.json
// Run: node scripts/build-lexicon.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../../ml/data/lexicon/hsk.csv");
const OUT = path.resolve(__dirname, "../public/lexicon.json");

function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Some headwords carry a usage note in parens, e.g. "第（第二）" or "们（朋友们）" — strip it.
const stripParen = (s) => s.replace(/[（(][^）)]*[）)]/g, "").trim();

const raw = fs.readFileSync(SRC, "utf8");
const rows = parseCSV(raw).slice(1).filter((r) => r.length >= 5 && r[2]);

/** @type {Map<string, {level:number, pinyin:string, gloss:string}>} */
const byWord = new Map();

for (const [, levelStr, chineseField, pinyinField, gloss] of rows) {
  const level = Number(levelStr);
  const words = chineseField.split("｜").map((w) => stripParen(w)).filter(Boolean);
  const pinyins = pinyinField.split("｜").map((p) => stripParen(p).trim());
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const pinyin = pinyins[i] ?? pinyins[0] ?? "";
    const existing = byWord.get(word);
    // A word can recur across rows (different senses); keep the easiest (lowest) level.
    if (!existing || level < existing.level) {
      byWord.set(word, { level, pinyin, gloss: gloss.trim() });
    }
  }
}

const entries = [...byWord.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([word, e]) => ({ word, ...e }));

fs.writeFileSync(OUT, JSON.stringify(entries));
console.log(`Wrote ${entries.length} lexicon entries to ${OUT}`);

// Converts ml/data/lexicon/hsk30-grammar.csv (ivankra/hsk30, the 2021 HSK 3.0 grammar list)
// -> apps/web/public/grammar-catalog.json
// Run: node scripts/build-grammar-catalog.mjs
//
// The list mixes grammar points with word-class entries (modal verbs, 都1, 还2), parts of a
// sentence and phrase types. Only the entries a learner studies as a pattern are kept; the rest
// belong with the word lexicon or are too abstract to card.
//
// Point shape: { id, level, group, name, desc, frames? }
//   id      "g" + the row number of the list, stable across rebuilds
//   level   1-6, or 7 for the whole 7-9 band
//   name    what the point is called on a card front or in a list
//   desc    the formal description from the list (no explanations or examples exist in the source)
//   frames  surface templates such as "又……又……", for points that can be found by pattern matching
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../../ml/data/lexicon/hsk30-grammar.csv");
const OUT = path.resolve(__dirname, "../public/grammar-catalog.json");

export function parseCSV(text) {
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

// Groups kept as grammar points. 词类 / 语素 are word classes, 短语 are phrase types and
// idioms, 句子成分 are parts of a sentence (only the complements are kept), 句群 is discourse.
const KEPT_GROUPS = new Set(["句子的类型", "动作的态", "特殊表达法", "提问的方法", "固定格式", "强调的方法", "口语格式"]);
const isKept = (group, category) => KEPT_GROUPS.has(group) || (group === "句子成分" && category === "补语");

const squash = (s) => s.replace(/\s+/g, " ").trim();

// "比较句2：…" -> "比较句2"; clause pairs are named by their frames; otherwise the row's own label.
// The text sits in Content or, on some rows, in Details.
function nameOf(group, category, details, content, frames) {
  if (group === "固定格式" || group === "口语格式" || group === "提问的方法" || group === "强调的方法") return squash(category);
  if (category === "复句" && frames.length > 0) return `${details}：${frames.join(" / ")}`;
  const label = (content || details).split("\n")[0].match(/^([^：:（(\s]{1,14}?\d+)(?:[：:\s]|$)/);
  if (label) return label[1];
  // Details that only list options ("（1）…（2）…") are a description; the name is then the category.
  return squash(details && !details.startsWith("（") ? details : category);
}

// What the list says about the point, without repeating the name.
function descOf(group, category, details, content, name) {
  if (group === "固定格式" || group === "口语格式" || group === "提问的方法" || group === "强调的方法") return "";
  if (category === "复句") return "";
  const text = squash(content || details);
  const rest = text.startsWith(name) ? text.slice(name.length).replace(/^[：:\s]+/, "") : text;
  return rest === name ? "" : rest;
}

// Surface templates, where the list gives them as ……-patterns.
function framesOf(group, category, details, content) {
  if (group === "固定格式" || group === "口语格式") return [squash(category)];
  // 用“连……也/都……”表示强调: the quoted part is the frame.
  if (group === "强调的方法") return [...category.matchAll(/“([^”]+)”/g)].map((m) => squash(m[1])).filter((f) => f.includes("……"));
  if (group === "句子的类型" && category === "复句") {
    const joined = content.includes("用关联词语") ? content.split(/用关联词语[：:]/)[1] ?? "" : content;
    return joined.split(/[；;\n]/).map(squash).filter((f) => f.includes("……"));
  }
  return [];
}

const rows = parseCSV(fs.readFileSync(SRC, "utf8").replace(/^﻿/, ""));
const [header, ...data] = rows;
const col = (name) => header.indexOf(name);
const [iNo, iLevel, iGroup, iCategory, iDetails, iContent] = ["No", "Level", "Group", "Category", "Details", "Content"].map(col);

const points = [];
for (const r of data) {
  if (!r[iNo]) continue;
  const [group, category, details, content] = [r[iGroup], r[iCategory], r[iDetails], r[iContent]];
  if (!isKept(group, category)) continue;
  if (category.startsWith("※") || details.startsWith("※")) continue; // a cross-reference to another row
  const frames = framesOf(group, category, details, content);
  const point = {
    id: `g${r[iNo]}`,
    level: r[iLevel] === "7-9" ? 7 : Number(r[iLevel]),
    group: group === "句子的类型" || group === "句子成分" ? category : group,
  };
  point.name = nameOf(group, category, details, content, frames);
  point.desc = descOf(group, category, details, content, point.name);
  if (frames.length > 0) point.frames = frames;
  points.push(point);
}

fs.writeFileSync(OUT, JSON.stringify(points));
console.log(`wrote ${points.length} grammar points to ${path.relative(process.cwd(), OUT)}`);

// Converts ml/data/lexicon/hsk30-grammar.csv (ivankra/hsk30, the 2021 HSK 3.0 grammar list)
// -> apps/web/public/grammar-catalog.json
// Run: node scripts/build-grammar-catalog.mjs
//
// The list mixes grammar points with word-class entries (modal verbs, 都1, 还2), parts of a
// sentence and phrase types. Only the entries a learner studies as a pattern are kept; the rest
// belong with the word lexicon or are too abstract to card.
//
// Point shape: { id, level, group, name, en?, desc, frames? }
//   id      "g" + the row number of the list, stable across rebuilds
//   level   1-6, or 7 for the whole 7-9 band
//   name    what the point is called on a card front or in a list
//   en      English name of a structure or clause type; fixed patterns (又……又……) have none
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

// English names, so a point such as 连动句1 can be told apart without reading the Chinese label.
// Keyed by the name without its trailing number; every structure in the list needs one (the build stops otherwise).
const ENGLISH = {
  主谓句: "subject-predicate sentence",
  单句: "simple sentence",
  陈述句: "statement",
  疑问句: "question",
  祈使句: "imperative",
  感叹句: "exclamation",
  "“是”字句": "sentences with 是",
  "“有”字句": "sentences with 有",
  比较句: "comparison",
  变化态: "change of state (了)",
  完成态: "completed action (了)",
  进行态: "action in progress (在, 正在)",
  持续态: "continuing state (着)",
  经历态: "past experience (过)",
  钱数表示法: "expressing amounts of money",
  时间表示法: "expressing time",
  序数表示法: "ordinal numbers",
  概数表示法: "approximate numbers",
  "小数、分数、百分数、倍数的表示法；": "decimals, fractions, percentages and multiples",
  "用“吗”提问": "yes/no question with 吗",
  "用“多、多少、几、哪、哪儿、哪里、哪些、什么、谁、怎么”提问": "questions with question words",
  "用“还是”提问": "alternative question with 还是",
  用正反疑问形式提问: "A-not-A question",
  "用“好吗/可以吗/行吗/怎么样”提问": "tag question (好吗, 可以吗)",
  "用“什么时候、什么样、为什么、怎么样、怎样”提问": "questions with 什么时候, 为什么, 怎么样",
  "用“呢”构成的省略式疑问句“代词/名词+呢？”提问": "elliptical question with 呢",
  "用“是不是”提问": "question with 是不是",
  "用“吧”提问": "question with 吧",
  用疑问语调表示疑问: "question by intonation",
  结果补语: "resultative complement",
  趋向补语: "directional complement",
  状态补语: "complement of state (得)",
  数量补语: "complement of quantity",
  可能补语: "potential complement",
  程度补语: "complement of degree",
  存现句: "existential sentence",
  连动句: "serial verb sentence",
  "“是……的”句": "是……的 sentence",
  双宾语句: "double-object sentence",
  "“把”字句": "把 sentence (disposal)",
  被动句: "passive sentence",
  兼语句: "pivotal sentence (causative or naming)",
  重动句: "verb-repeating sentence",
  "用“就”表示强调": "emphasis with 就",
  "用“是”表示强调": "emphasis with 是",
  "用反问句表示强调 反问句1：不是……吗？/难道……吗？": "rhetorical question with 不是……吗 / 难道……吗",
  "用反问句表示强调 反问句2：由疑问代词构成的反问句": "rhetorical question with a question word",
  "用反问句表示强调 反问句3：何必/何苦……呢？": "rhetorical question with 何必 / 何苦",
  用双重否定表示强调: "emphasis by double negation",
  "用“再也不/没”表示强调": "emphasis with 再也不 / 再也没",
  "用副词“可”表示强调": "emphasis with 可",
  "用“怎么都/也+不/没”表示强调": "emphasis with 怎么都 / 怎么也 + negation",
};

// Clause pairs are named "并列复句：…"; the part before the colon says the kind.
const CLAUSE_ENGLISH = {
  并列复句: "coordinate clauses",
  承接复句: "sequential clauses",
  递进复句: "progressive clauses",
  选择复句: "alternative clauses",
  转折复句: "contrast clauses",
  假设复句: "hypothetical clauses",
  条件复句: "conditional clauses",
  因果复句: "cause and effect clauses",
  紧缩复句: "compressed clauses",
  目的复句: "purpose clauses",
  让步复句: "concessive clauses",
  二重复句: "two-level complex sentence",
  解说复句: "explanatory clauses",
  多重复句: "multi-level complex sentence",
};

function englishOf(name) {
  const base = name.replace(/\d+$/, "");
  return ENGLISH[base] ?? CLAUSE_ENGLISH[base.split("：")[0]];
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
  const en = englishOf(point.name);
  if (en) point.en = en;
  else if (frames.length === 0) throw new Error(`no English name for ${point.id} ${point.name}`);
  points.push(point);
}

fs.writeFileSync(OUT, JSON.stringify(points));
console.log(`wrote ${points.length} grammar points to ${path.relative(process.cwd(), OUT)}`);

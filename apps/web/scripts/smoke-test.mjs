// Minimal runnable check for segment()/analyze() — not a framework, just
// asserts the behaviors the v0.1 checklist depends on.
import assert from "node:assert/strict";
import { segment } from "../lib/segment.ts";
import { analyze } from "../lib/analyze.ts";
import { supportedMax } from "../lib/level.ts";
import { hashString } from "../lib/hash.ts";
import { parseAnkiExport } from "../lib/anki-import.ts";
import { planSplit } from "../lib/split-front.ts";

// Longest-match re-merge: ICU splits 电脑 into 电+脑, lexicon has 电脑 (HSK1).
{
  const words = segment("电脑很贵");
  const dianNao = words.find((w) => w.surface === "电脑");
  assert.ok(dianNao, "expected 电脑 to be re-merged into one token");
  assert.equal(dianNao.level, 1);
}

// Known gap (logged, not patched): ICU merges 你好 into one segment, and the
// HSK dataset only has bare 好 (level 4) — so 你好 as a whole is OOV even
// though 你 and 好 are individually basic. Feeds the v1 jieba decision.
{
  const words = segment("你好吗");
  const niHao = words.find((w) => w.surface === "你好");
  assert.ok(niHao, "expected ICU to keep 你好 as one segment");
  assert.equal(niHao.level, null);
}

// supported_max(k): needs >= k words at a level to "support" it, else falls
// back to p90 — mirrors ml/src/hanzisave_ml/silver_label.py.
{
  assert.equal(supportedMax([1, 1, 3], 2), 1);
  assert.equal(supportedMax([1, 3], 2), 1); // no level has 2 supporters -> p90([1,3]) picks the lower one
  assert.equal(supportedMax([], 2), null);
}

// analyze(): sentence splitting + per-word flagging against learnerLevel.
{
  const result = analyze("我喜欢吃苹果。他讨厌喝咖啡！", 2);
  assert.equal(result.sentences.length, 2);
  const flaggedWords = result.sentences.flatMap((s) => s.words.filter((w) => w.flagged));
  assert.ok(flaggedWords.length > 0, "expected at least one flagged (OOV or above-level) word");
}

// hashString(): the gloss cache key is (word, sentenceHash) — must be
// deterministic and distinguish different sentences.
{
  assert.equal(hashString("你好"), hashString("你好"));
  assert.notEqual(hashString("你好吗"), hashString("你好"));
}

// Anki import: quoted fields may hold tabs, newlines and "" escapes; multi-line
// notes must stay one note (a naive line split would count them as several).
{
  const raw = [
    "#separator:tab",
    "#html:true",
    "围巾\twéijīn<br>Scarf\t",
    '具体流程\t"jùtǐ<br>Note: ""具体"" = details\nsecond line"\t',
    "优惠 / 会员\tyōuhuì / huìyuán<br>Discount / Member\t",
    "淘宝 / 淘宝网\ttáobǎo\t",
    "又…又…\tyòu… yòu…\t",
    "打车\tPinyin: dǎ chē<br>Jyutping: daa2 ce1\t",
    "计划\tPinyin: jì huà<br>Patterns:<br>- 制定 + 计划\t",
  ].join("\n");
  const deck = parseAnkiExport(raw);
  assert.equal(deck.headers.separator, "tab");
  assert.equal(deck.notes.length, 7);
  assert.equal(deck.notes[1].backText.includes('Note: "具体" = details\nsecond line'), true);
  assert.equal(deck.notes[2].splitKind, "pair"); // different words -> split
  assert.deepEqual(deck.notes[2].frontParts, ["优惠", "会员"]);
  assert.equal(deck.notes[3].splitKind, "variant"); // 淘宝网 contains 淘宝 -> keep together
  assert.equal(deck.notes[4].isGrammar, true);
  assert.equal(deck.notes[0].isGrammar, false);
  assert.deepEqual(
    deck.notes.map((n) => n.format),
    ["old", "old", "old", "old", "old", "intermediate", "current"],
  );
}

// planSplit(): the official list decides; heuristics are only proposals.
{
  const index = {
    entries: { A: ["1", "N"], B: ["2", "V"], C: ["2", "V"], D: ["4", "V"] },
    forms: { "爸爸": ["A"], "爸": ["A"], "选": ["B"], "选择": ["D"], "租": ["B"], "出租": ["C"] },
  };
  const p = (f) => planSplit(f, index);
  assert.deepEqual([p("爸爸 / 爸").action, p("爸爸 / 爸").status], ["keep", "official"]);
  assert.deepEqual([p("选 / 选择").action, p("选 / 选择").status], ["split", "official"]); // different rows
  assert.deepEqual([p("租 / 出租").action, p("租 / 出租").status], ["split", "official"]); // same level+POS, still two ids
  assert.deepEqual([p("淘宝 / 淘宝网").action, p("淘宝 / 淘宝网").status], ["keep", "proposal"]);
  assert.deepEqual([p("京东网 / 天猫网").action, p("京东网 / 天猫网").status], ["split", "proposal"]);
  assert.equal(p("爸 / 淘宝").status, "proposal"); // only one part is listed
  assert.deepEqual([p("之 / ……分之……").action, p("之 / ……分之……").status], ["split", "proposal"]); // word + pattern
  assert.equal(p("打车").action, "none");
}

console.log("smoke-test: all checks passed");

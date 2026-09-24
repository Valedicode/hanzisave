// Minimal runnable check for segment()/analyze() — not a framework, just
// asserts the behaviors the v0.1 checklist depends on.
import assert from "node:assert/strict";
import { segment } from "../lib/segment.ts";
import { analyze } from "../lib/analyze.ts";
import { supportedMax } from "../lib/level.ts";

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

console.log("smoke-test: all checks passed");

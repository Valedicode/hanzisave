// Dev tool: runs the same items through several models and reports format
// validity, cost and latency, plus the raw cards for side-by-side review.
//   node --env-file=.env --import tsx scripts/card-compare.mjs <out-dir> <model> [<model> ...]
// Set COMPARE_REASONING=off|low|medium to control reasoning on models that support it.
// Uses the OpenAI-compatible endpoint from OPENAI_BASE_URL (OpenRouter).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { parseAnkiExport } from "../lib/anki-import.ts";
import { buildCardPrompt, cleanCardOutput } from "../lib/card-prompt.ts";
import { checkCardFormat } from "../lib/card-format.ts";
import { loadCardSpec } from "../lib/card-spec.ts";

const [outDir, ...models] = process.argv.slice(2);
if (!outDir || models.length === 0) {
  console.error("usage: card-compare.mjs <out-dir> <model> [<model> ...]");
  process.exit(1);
}

// Items not used as worked examples in the spec, so models can't just copy them.
const NEW_WORDS = ["经常", "安排", "方便", "会议", "好像", "取消"];
const REWRITE_WORDS = ["具体流程", "朝南", "炒鱿鱼", "正好", "围巾"];
const GRAMMAR = ["连……都……", "越来越……", "是……的"];
const REWRITE_GRAMMAR = ["非……不可"];

const deck = parseAnkiExport(readFileSync("../../Chinese Level 2.txt", "utf8"));
const oldBack = (front) => deck.notes.find((n) => n.front === front)?.backText;

const requests = [
  ...NEW_WORDS.map((item) => ({ label: `new:${item}`, item, type: "word" })),
  ...REWRITE_WORDS.map((item) => ({ label: `rewrite:${item}`, item, type: "word", oldBack: oldBack(item) })),
  ...GRAMMAR.map((item) => ({ label: `grammar:${item}`, item, type: "grammar" })),
  ...REWRITE_GRAMMAR.map((item) => ({ label: `rewrite:${item}`, item, type: "grammar", oldBack: oldBack(item) })),
];
for (const r of requests) if (r.label.startsWith("rewrite") && !r.oldBack) console.warn(`no deck note for ${r.item}`);

const client = new OpenAI({ timeout: 120_000, maxRetries: 0 });
const effort = process.env.COMPARE_REASONING;
const reasoning = effort === "off" ? { enabled: false } : effort ? { effort } : undefined;
const spec = loadCardSpec();

// Prices ($ per token) from the public OpenRouter model list.
const list = await (await fetch("https://openrouter.ai/api/v1/models")).json();
const price = (id) => list.data.find((m) => m.id === id)?.pricing;

async function run(model, req) {
  const start = Date.now();
  const p = price(model);
  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 4000,
      ...(reasoning && { reasoning }),
      messages: [
        { role: "system", content: spec },
        { role: "user", content: buildCardPrompt(req) },
      ],
    });
    const back = cleanCardOutput(completion.choices[0]?.message.content ?? "");
    const inTokens = completion.usage?.prompt_tokens ?? 0;
    const outTokens = completion.usage?.completion_tokens ?? 0;
    const cost = inTokens * Number(p?.prompt ?? 0) + outTokens * Number(p?.completion ?? 0);
    return { model, label: req.label, type: req.type, back, problems: checkCardFormat(back, req.type).problems, inTokens, outTokens, cost, ms: Date.now() - start };
  } catch (e) {
    return { model, label: req.label, type: req.type, back: "", problems: ["request failed"], inTokens: 0, outTokens: 0, cost: 0, ms: Date.now() - start, error: String(e).slice(0, 200) };
  }
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

mkdirSync(outDir, { recursive: true });
const results = [];
for (const model of models) {
  const rs = await pool(requests, 4, (r) => run(model, r));
  results.push(...rs);
  const ok = rs.filter((r) => r.problems.length === 0).length;
  const cost = rs.reduce((s, r) => s + r.cost, 0);
  const secs = (rs.reduce((s, r) => s + r.ms, 0) / rs.length / 1000).toFixed(1);
  console.log(`${model}: format ok ${ok}/${rs.length}, cost $${cost.toFixed(4)}, avg ${secs}s, errors ${rs.filter((r) => r.error).length}`);
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
}

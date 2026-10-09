// Dev tool: runs images through several vision models and scores the text they
// read against a ground-truth file (character accuracy via edit distance).
//   node --env-file=.env scripts/ocr-compare.mjs <truth.txt> <image> [<image> ...] -- <model> [<model> ...]
import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { OCR_PROMPT } from "../lib/ocr-prompt.ts";

const args = process.argv.slice(2);
const split = args.indexOf("--");
const [truthPath, ...images] = args.slice(0, split);
const models = args.slice(split + 1);
if (!truthPath || images.length === 0 || models.length === 0) {
  console.error("usage: ocr-compare.mjs <truth.txt> <image>... -- <model>...");
  process.exit(1);
}

const norm = (s) => s.replace(/\s+/g, "");
const truth = norm(readFileSync(truthPath, "utf8"));

function distance(a, b) {
  const m = [...a];
  const n = [...b];
  let prev = Array.from({ length: n.length + 1 }, (_, j) => j);
  for (let i = 1; i <= m.length; i++) {
    const cur = [i];
    for (let j = 1; j <= n.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (m[i - 1] === n[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n.length];
}

const mime = (f) => (f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
const client = new OpenAI({ timeout: 120_000, maxRetries: 0 });
const list = await (await fetch("https://openrouter.ai/api/v1/models")).json();
const price = (id) => list.data.find((m) => m.id === id)?.pricing;

for (const model of models) {
  for (const image of images) {
    const start = Date.now();
    try {
      const data = readFileSync(image).toString("base64");
      const r = await client.chat.completions.create({
        model,
        max_tokens: 2000,
        reasoning: { enabled: false },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: `data:${mime(image)};base64,${data}` } },
            ],
          },
        ],
      });
      const text = r.choices[0]?.message.content ?? "";
      const acc = Math.max(0, 1 - distance(norm(text), truth) / truth.length);
      const p = price(model);
      const cost = (r.usage?.prompt_tokens ?? 0) * Number(p?.prompt ?? 0) + (r.usage?.completion_tokens ?? 0) * Number(p?.completion ?? 0);
      console.log(`${model} | ${path.basename(image)} | accuracy ${(acc * 100).toFixed(1)}% | ${((Date.now() - start) / 1000).toFixed(1)}s | $${cost.toFixed(5)}`);
      if (acc < 0.97) console.log("   got:", JSON.stringify(text.slice(0, 200)));
    } catch (e) {
      console.log(`${model} | ${path.basename(image)} | FAILED ${String(e.message ?? e).slice(0, 100)}`);
    }
  }
}

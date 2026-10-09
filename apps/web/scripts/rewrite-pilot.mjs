// Dev tool: rewrites a sample of the real deck into the new card format and
// writes old vs new side by side for review. Spends a few cents.
//   node --env-file=.env --import tsx scripts/rewrite-pilot.mjs <out.md> [count]
import { readFileSync, writeFileSync } from "node:fs";
import { parseAnkiExport } from "../lib/anki-import.ts";
import { buildDeckPlan } from "../lib/deck-plan.ts";
import { generateValidCard } from "../lib/card-service.ts";
import { loadCardSpec } from "../lib/card-spec.ts";
import { createOpenAiProvider } from "../lib/llm/openai.ts";

const [outPath, countArg] = process.argv.slice(2);
if (!outPath) {
  console.error("usage: rewrite-pilot.mjs <out.md> [count]");
  process.exit(1);
}
const count = Number(countArg ?? 20);

const deck = parseAnkiExport(readFileSync("../../Chinese Level 2.txt", "utf8"));
const index = JSON.parse(readFileSync("public/hsk30-index.json", "utf8"));
const { units } = buildDeckPlan(deck, index);

// Evenly spaced sample, plus every grammar unit kind we can find so they are covered.
const step = Math.floor(units.length / count);
const sample = Array.from({ length: count }, (_, i) => units[i * step]);
const grammar = units.filter((u) => u.type === "grammar").slice(0, 3);
for (const g of grammar) if (!sample.includes(g)) sample.push(g);

const provider = createOpenAiProvider();
const spec = loadCardSpec();

const out = [`# Rewrite pilot — ${sample.length} cards, model ${process.env.CARD_MODEL}\n`];
let ok = 0;
let flagged = 0;
for (const u of sample) {
  const res = await generateValidCard(provider, { item: u.front, type: u.type, oldBack: u.oldBack }, spec);
  if (res.ok) ok++;
  if (/^Changed:/m.test(res.back)) flagged++;
  out.push(
    `## ${u.front}  (${u.type}, was ${u.format}${u.splitFrom ? `, split from "${u.splitFrom}"` : ""})\n`,
    "**Old**\n```\n" + u.oldBack + "\n```\n",
    `**New** ${res.ok ? "" : "(FAILED: " + res.problems.join("; ") + ")"}\n` + "```\n" + res.back + "\n```\n",
  );
}
out.splice(1, 0, `Valid: ${ok}/${sample.length} · cards with a Changed: line: ${flagged}\n`);
writeFileSync(outPath, out.join("\n"));
console.log(`valid ${ok}/${sample.length}, with Changed: ${flagged} -> ${outPath}`);

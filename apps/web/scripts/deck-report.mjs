// Local-only: prints how an Anki export parses and how combined fronts are
// decided against the official list. Usage:
//   node scripts/build-hsk30-index.mjs   (once)
//   npx tsx scripts/deck-report.mjs "../../Chinese Level 2.txt"
import { readFileSync } from "node:fs";
import { parseAnkiExport, summarize } from "../lib/anki-import.ts";
import { planSplit } from "../lib/split-front.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: deck-report.mjs <anki-export.txt>");
  process.exit(1);
}

const deck = parseAnkiExport(readFileSync(path, "utf8"));
const index = JSON.parse(readFileSync(new URL("../public/hsk30-index.json", import.meta.url), "utf8"));
console.log("headers:", deck.headers);
console.log(summarize(deck));

console.log("\ncombined fronts:");
for (const n of deck.notes) {
  if (n.frontParts.length < 2) continue;
  const plan = planSplit(n.front, index);
  console.log(`  #${n.row} ${JSON.stringify(n.frontParts)} -> ${plan.action} [${plan.status}] ${plan.reason}`);
}

const grammar = deck.notes.filter((n) => n.isGrammar);
console.log(`\ngrammar-looking (${grammar.length}):`, grammar.map((n) => n.front).join("  "));

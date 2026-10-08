// Local-only: prints how an Anki export parses. Usage:
//   pnpm tsx scripts/deck-report.mjs "../../Chinese Level 2.txt"
import { readFileSync } from "node:fs";
import { parseAnkiExport, summarize } from "../lib/anki-import.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: deck-report.mjs <anki-export.txt>");
  process.exit(1);
}

const deck = parseAnkiExport(readFileSync(path, "utf8"));
console.log("headers:", deck.headers);
console.log(summarize(deck));

const show = (label, pred, max = 12) => {
  const hits = deck.notes.filter(pred);
  console.log(`\n${label} (${hits.length})`);
  for (const n of hits.slice(0, max)) console.log(`  #${n.row} ${JSON.stringify(n.frontParts)}`);
};
show("pairs", (n) => n.splitKind === "pair", 40);
show("variants", (n) => n.splitKind === "variant", 40);
show("grammar-looking", (n) => n.isGrammar, 40);
show("odd fronts (long or non-Han)", (n) => n.front.length > 12 || !/\p{Script=Han}/u.test(n.front), 40);

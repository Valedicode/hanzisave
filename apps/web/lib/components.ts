// Breaks a fixed expression such as 注册银行卡 into its parts (注册 + 银行卡) so each
// part can become a card of its own.

import { segment } from "./segment";

const HAN = /^\p{Script=Han}+$/u;

const MAX_RUN = 3;

// The parts of a phrase worth a card. A lone character is skipped: it is usually a
// particle or bound morpheme (员, 了). But the segmenter splits a word it doesn't know
// (绑定) into single characters, so a short run of them side by side is joined back
// into one part. The phrase itself is ignored when it appears in `known`, otherwise a
// phrase the learner already has would be kept whole and never split.
export function splitComponents(phrase: string, known: ReadonlySet<string>): string[] {
  const extra = new Set(known);
  extra.delete(phrase);
  const words = segment(phrase, { extra })
    .map((w) => w.surface)
    .filter((s) => HAN.test(s));
  if (words.length < 2) return []; // a single word, not a phrase

  const parts: string[] = [];
  let run = "";
  const flushRun = () => {
    if (run.length >= 2 && run.length <= MAX_RUN) parts.push(run);
    run = "";
  };
  for (const word of words) {
    if (word.length === 1) {
      run += word;
      continue;
    }
    flushRun();
    parts.push(word);
  }
  flushRun();
  return [...new Set(parts.filter((s) => s !== phrase))];
}

export interface ComponentPlan {
  add: { front: string; componentOf: string }[];
  skipped: string[]; // components that already exist, so no card is made
  withoutParts: string[]; // phrases that did not split into anything
}

// `existing` is every word the learner already has or has queued. A component
// is added once, and only if it is not in `existing`.
export function planComponentCards(phrases: string[], existing: ReadonlySet<string>): ComponentPlan {
  const seen = new Set(existing);
  const plan: ComponentPlan = { add: [], skipped: [], withoutParts: [] };
  for (const phrase of phrases) {
    const parts = splitComponents(phrase, existing);
    if (parts.length === 0) plan.withoutParts.push(phrase);
    for (const part of parts) {
      if (seen.has(part)) {
        if (!plan.skipped.includes(part)) plan.skipped.push(part);
        continue;
      }
      seen.add(part);
      plan.add.push({ front: part, componentOf: phrase });
    }
  }
  return plan;
}

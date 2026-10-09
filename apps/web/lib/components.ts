// Breaks a fixed expression such as 注册银行卡 into its parts (注册 + 银行卡) so each
// part can become a card of its own.

import { segment } from "./segment";

const HAN = /^\p{Script=Han}+$/u;

// The parts of a phrase worth a card. Single characters are skipped: they are
// usually particles or bound morphemes (员, 了), not words to learn by themselves.
// The phrase itself is ignored when it appears in `known`, otherwise a phrase the
// learner already has would be kept whole and never split.
export function splitComponents(phrase: string, known: ReadonlySet<string>): string[] {
  const extra = new Set(known);
  extra.delete(phrase);
  const words = segment(phrase, { extra })
    .map((w) => w.surface)
    .filter((s) => HAN.test(s));
  if (words.length < 2) return []; // a single word, not a phrase
  return [...new Set(words.filter((s) => s.length >= 2 && s !== phrase))];
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

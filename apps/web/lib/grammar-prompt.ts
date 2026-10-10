// Asks the card model which grammar points of the catalog a text uses. Points with a fixed surface pattern
// are found by rules (grammar-detect.ts); this covers the ones that need the sentence structure (把, 被,
// 比, complements, 是……的). The model may only answer with ids from the list it is given.

import { splitSentences } from "./analyze";
import type { GrammarCandidate, GrammarFinding } from "./llm/types";

export const GRAMMAR_SYSTEM = `You help a learner of Mandarin find the grammar points in a Chinese text. You get a list of grammar points, one per line as "id | name | description", and then the text. For each point, decide whether the text contains a sentence that really uses that structure. Report a point only when a sentence clearly uses the structure itself, not just a word from its name. Several points of one kind (for example 比较句2 and 比较句3) are different structures: report the ones whose description fits the sentence.
Reply with ONLY a JSON object, with no code fence and no commentary: {"points": [{"id": "g184", "sentence": "...", "words": "..."}]}. Use only ids from the list, at most one entry per id, and copy the sentence exactly from the text. "words" is the shortest stretch of that sentence, copied exactly and without gaps, that shows the structure (for 把: from 把 to the end of its verb phrase; for 比: from 比 to the adjective). If no point applies, reply {"points": []}.`;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

export function buildGrammarPrompt(text: string, candidates: GrammarCandidate[]): string {
  const list = candidates.map((c) => `${c.id} | ${c.name} | ${clip(c.desc, 140)}`).join("\n");
  return `Grammar points:\n${list}\n\nText:\n${text}`;
}

const squash = (s: string) => s.replace(/\s+/g, "");

// The findings in a reply, limited to the points that were asked about and to sentences that really are
// in the text (the model's copy is replaced by the text's own sentence). null when the reply is unusable.
export function parseGrammarReply(reply: string, text: string, candidateIds: string[]): GrammarFinding[] | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1)) as { points?: unknown };
    if (!Array.isArray(parsed.points)) return null;
    const asked = new Set(candidateIds);
    const sentences = splitSentences(text);
    const seen = new Set<string>();
    const findings: GrammarFinding[] = [];
    for (const item of parsed.points) {
      const { id, sentence, words } = (item ?? {}) as { id?: unknown; sentence?: unknown; words?: unknown };
      if (typeof id !== "string" || typeof sentence !== "string" || !asked.has(id) || seen.has(id)) continue;
      const wanted = squash(sentence);
      if (!wanted) continue;
      const actual = sentences.find((s) => squash(s).includes(wanted) || wanted.includes(squash(s)));
      if (!actual) continue;
      seen.add(id);
      // Only a stretch that really is in the sentence can be marked there.
      const span = typeof words === "string" ? words.trim() : "";
      findings.push(span && actual.includes(span) ? { id, sentence: actual, words: span } : { id, sentence: actual });
    }
    return findings;
  } catch {
    return null;
  }
}

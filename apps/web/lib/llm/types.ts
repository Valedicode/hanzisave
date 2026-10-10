// Provider-agnostic contract for the LLM calls the app makes. Route handlers
// depend on this, never on a vendor SDK, so switching provider touches one file.

import type { Gloss, GlossRequest } from "../gloss-schema";

export type CardType = "word" | "grammar";

export interface CardRequest {
  item: string;
  type: CardType;
  context?: string; // sentence the item was met in; used to pick the sense
  hsk?: string; // level from the lexicon/catalog, copied verbatim into the card
  oldBack?: string; // existing card Back, present only in rewrite mode
}

export interface ImageInput {
  mime: string; // e.g. image/jpeg
  data: string; // base64, without the data: prefix
}

// A catalog grammar point offered to the model, and the sentence it says uses it.
export interface GrammarCandidate {
  id: string;
  name: string;
  desc: string;
}

export interface GrammarFinding {
  id: string;
  sentence: string;
}

export interface LlmProvider {
  // Returns the card Back text exactly as the model produced it.
  generateCard(req: CardRequest, spec: string): Promise<string>;
  // Returns the Chinese text found in a photo or screenshot ("" if there is none).
  extractText(image: ImageInput): Promise<string>;
  // A short preview of a word as used in a sentence: pinyin, meaning and a new example.
  generateGloss(req: GlossRequest): Promise<Gloss>;
  // Which of these strings are real standalone words, worth a vocabulary card of their own.
  checkWords(candidates: string[]): Promise<string[]>;
  // Which of these grammar points the text uses, each with the sentence that uses it.
  findGrammar(text: string, candidates: GrammarCandidate[]): Promise<GrammarFinding[]>;
}

// Errors a provider reports in vendor-neutral form; `status` is an HTTP status
// the route can pass straight through.
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

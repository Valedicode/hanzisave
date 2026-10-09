// Provider-agnostic contract for the LLM calls the app makes. Route handlers
// depend on this, never on a vendor SDK, so switching provider touches one file.

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

export interface LlmProvider {
  // Returns the card Back text exactly as the model produced it.
  generateCard(req: CardRequest, spec: string): Promise<string>;
  // Returns the Chinese text found in a photo or screenshot ("" if there is none).
  extractText(image: ImageInput): Promise<string>;
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

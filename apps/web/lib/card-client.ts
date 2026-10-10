import type { CardRequest } from "./llm/types";
import { withPatternPinyin } from "./pattern-pinyin";

export class CardRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems?: string[],
  ) {
    super(message);
    this.name = "CardRequestError";
  }

  // Failures that every further request would repeat; callers should stop.
  get fatal(): boolean {
    return this.status === 401 || this.status === 402 || this.status === 403;
  }
}

// Calls POST /api/card; resolves to the card Back, with pinyin added to its patterns.
export async function requestCard(req: CardRequest, accessCode?: string): Promise<string> {
  const res = await fetch("/api/card", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify(req),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CardRequestError(body.error ?? `card request failed (${res.status})`, res.status, body.problems);
  }
  // Every card gets pinyin on its pattern lines, whichever screen asked for it.
  return withPatternPinyin(body.back as string);
}

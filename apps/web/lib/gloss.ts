import { db } from "./db";
import { hashString } from "./hash";
import type { Gloss } from "./gloss-schema";

export class GlossRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GlossRequestError";
  }
}

// Cached forever by (word, sentence_hash) per the project plan: the cache
// mirror lives client-side in Dexie; the route handler itself is stateless.
export async function getGloss(word: string, sentence: string, accessCode?: string): Promise<Gloss> {
  const sentenceHash = hashString(sentence);
  const key = `${word}|${sentenceHash}`;

  const cached = await db.gloss_cache.get(key);
  if (cached) return cached;

  const res = await fetch("/api/gloss", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify({ word, sentence }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new GlossRequestError(body.error ?? `gloss request failed (${res.status})`, res.status);
  }
  const gloss = (await res.json()) as Gloss;

  await db.gloss_cache.put({ key, word, sentenceHash, ...gloss, createdAt: Date.now() });
  return gloss;
}

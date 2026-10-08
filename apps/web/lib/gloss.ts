import { db } from "./db";
import { hashString } from "./hash";
import type { Gloss } from "./gloss-schema";

// Cached forever by (word, sentence_hash) per the project plan: the cache
// mirror lives client-side in Dexie; the route handler itself is stateless.
export async function getGloss(word: string, sentence: string): Promise<Gloss> {
  const sentenceHash = hashString(sentence);
  const key = `${word}|${sentenceHash}`;

  const cached = await db.gloss_cache.get(key);
  if (cached) return cached;

  const res = await fetch("/api/gloss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, sentence }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `gloss request failed (${res.status})`);
  }
  const gloss = (await res.json()) as Gloss;

  await db.gloss_cache.put({ key, word, sentenceHash, ...gloss, createdAt: Date.now() });
  return gloss;
}

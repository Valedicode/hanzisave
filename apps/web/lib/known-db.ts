import { db } from "./db";

// Every word the learner already has or has queued: the Anki deck, words marked
// as known by hand, and cards made from earlier scans that haven't been discarded.
export async function loadKnownWords(): Promise<Set<string>> {
  const [known, queued] = await Promise.all([
    db.known.where("type").equals("word").toArray(),
    db.new_cards.where("status").notEqual("discarded").toArray(),
  ]);
  return new Set([...known.map((k) => k.item), ...queued.map((c) => c.front)]);
}

// Marks words as known so they stop showing up as new.
export async function markKnown(items: string[]): Promise<void> {
  const now = Date.now();
  await db.known.bulkPut(
    items.map((item) => ({ key: `word:${item}`, item, type: "word" as const, source: "manual" as const, createdAt: now })),
  );
}

// Catalog grammar points the learner already has, by point id (g94): the Anki deck, points marked by hand,
// and cards made from earlier scans that haven't been discarded.
export async function loadKnownGrammar(): Promise<Set<string>> {
  const [known, queued] = await Promise.all([
    db.known.where("type").equals("grammar").toArray(),
    db.new_cards.where("status").notEqual("discarded").toArray(),
  ]);
  return new Set([...known.map((k) => k.item), ...queued.flatMap((c) => (c.type === "grammar" && c.pointId ? [c.pointId] : []))]);
}

// Marks grammar points as known so they stop showing up as new.
export async function markGrammarKnown(ids: string[]): Promise<void> {
  const now = Date.now();
  await db.known.bulkPut(
    ids.map((item) => ({ key: `grammar:${item}`, item, type: "grammar" as const, source: "manual" as const, createdAt: now })),
  );
}

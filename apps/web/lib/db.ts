import Dexie, { type EntityTable } from "dexie";
import type { HskLevel } from "./lexicon";

export interface TextRecord {
  id?: number;
  title: string;
  content: string;
  createdAt: number;
}

export interface CardRecord {
  id?: number;
  word: string;
  level: HskLevel | null;
  pinyin: string;
  gloss: string;
  example: string;
  sentenceText: string;
  textId?: number;
  createdAt: number;
}

export interface ReviewRecord {
  id?: number;
  cardId: number;
  outcome: "again" | "got_it";
  elapsedMs: number;
  createdAt: number;
}

export interface GlossCacheRecord {
  key: string; // `${word}|${sentenceHash}`
  word: string;
  sentenceHash: string;
  pinyin: string;
  gloss: string;
  example: string;
  createdAt: number;
}

// One card per imported (and possibly split) Anki note; rewritten in A0.
export interface DeckUnitRecord {
  id?: number;
  front: string;
  forms: string[];
  type: "word" | "grammar";
  format: "old" | "intermediate" | "current";
  oldBack: string;
  tags: string;
  sourceRow: number;
  splitFrom?: string;
  ankiNoteId?: number; // Anki note id when imported from an .apkg
  ankiGuid?: string;
  status: "pending" | "generated" | "approved" | "skipped" | "failed";
  newBack?: string; // rewritten Back in the card spec format
  changed?: string; // factual correction the model reported, for review
  problems?: string[]; // why generation failed
  stale?: boolean; // the source note changed in Anki after this rewrite was made
  missing?: boolean; // no longer present in the latest Anki export
  createdAt: number;
}

// The known set: everything the learner already has (words and grammar).
export interface KnownRecord {
  key: string; // `${type}:${item}`
  item: string;
  type: "word" | "grammar";
  source: "anki" | "manual";
  createdAt: number;
}

export const db = new Dexie("hanzisave") as Dexie & {
  texts: EntityTable<TextRecord, "id">;
  cards: EntityTable<CardRecord, "id">;
  reviews: EntityTable<ReviewRecord, "id">;
  gloss_cache: EntityTable<GlossCacheRecord, "key">;
  deck_units: EntityTable<DeckUnitRecord, "id">;
  known: EntityTable<KnownRecord, "key">;
};

db.version(1).stores({
  texts: "++id, createdAt",
  cards: "++id, word, textId, createdAt",
  reviews: "++id, cardId, createdAt",
  gloss_cache: "key, word",
});

db.version(2).stores({
  deck_units: "++id, front, type, sourceRow",
  known: "key, item, type, source",
});

// Rewrite workflow: every imported card starts as "pending".
db.version(3)
  .stores({ deck_units: "++id, front, type, sourceRow, status" })
  .upgrade((tx) =>
    tx
      .table("deck_units")
      .toCollection()
      .modify((u) => {
        u.status ??= "pending";
      }),
  );

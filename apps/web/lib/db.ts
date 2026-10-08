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

export const db = new Dexie("hanzisave") as Dexie & {
  texts: EntityTable<TextRecord, "id">;
  cards: EntityTable<CardRecord, "id">;
  reviews: EntityTable<ReviewRecord, "id">;
  gloss_cache: EntityTable<GlossCacheRecord, "key">;
};

db.version(1).stores({
  texts: "++id, createdAt",
  cards: "++id, word, textId, createdAt",
  reviews: "++id, cardId, createdAt",
  gloss_cache: "key, word",
});

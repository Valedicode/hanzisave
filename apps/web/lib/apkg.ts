// Reads the notes out of an Anki package (.apkg). Server-side only: it uses
// Node's built-in SQLite and zstd, so the package never needs a native module.
//
// A package is a zip. Modern ones hold the collection as `collection.anki21b`
// (zstd-compressed SQLite); older ones use `collection.anki21` / `.anki2`
// (plain SQLite). Only the collection file is inflated, never the media.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdDecompressSync } from "node:zlib";
import { unzipSync } from "fflate";

export interface ApkgNote {
  noteId: number; // stable across edits and exports; what history is attached to
  guid: string;
  fields: string[]; // raw field HTML, in note-type order
  tags: string;
}

const COLLECTION_FILES = ["collection.anki21b", "collection.anki21", "collection.anki2"];

export function readApkg(bytes: Uint8Array): ApkgNote[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => COLLECTION_FILES.includes(f.name) });
  } catch {
    throw new Error("Not an Anki package (could not open it as a zip).");
  }
  const name = COLLECTION_FILES.find((n) => files[n]);
  if (!name) throw new Error("Not an Anki package (no collection inside).");

  const sqlite = name.endsWith("b") ? zstdDecompressSync(files[name]) : files[name];

  // node:sqlite opens files, not buffers, so use a private temp file.
  const dir = mkdtempSync(path.join(tmpdir(), "hanzisave-apkg-"));
  try {
    const file = path.join(dir, "collection.sqlite");
    writeFileSync(file, sqlite);
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const rows = db.prepare("select id, guid, flds, tags from notes order by id").all() as {
        id: number;
        guid: string;
        flds: string;
        tags: string;
      }[];
      return rows.map((r) => ({
        noteId: Number(r.id),
        guid: r.guid,
        fields: r.flds.split("\x1f"),
        tags: r.tags.trim(),
      }));
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

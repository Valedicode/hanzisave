import { z } from "zod";

// Everything the app keeps in the browser, as one JSON file. The format is
// validated on restore so a wrong or damaged file can't wipe the library.

const rows = z.array(z.record(z.string(), z.unknown()));

const DeckUnitRow = z.looseObject({
  front: z.string(),
  oldBack: z.string(),
  status: z.enum(["pending", "generated", "approved", "skipped", "failed"]),
});

const KnownRow = z.looseObject({ key: z.string(), item: z.string() });

export const BackupSchema = z.object({
  app: z.literal("hanzisave"),
  version: z.literal(1),
  exportedAt: z.string(),
  tables: z.object({
    deck_units: z.array(DeckUnitRow),
    known: z.array(KnownRow),
    texts: rows,
    cards: rows,
    reviews: rows,
    new_cards: rows.default([]), // absent in backups made before scanning existed
  }),
});

export type Backup = z.infer<typeof BackupSchema>;
export type BackupTables = Backup["tables"];

export const BACKUP_TABLES = ["deck_units", "known", "texts", "cards", "reviews", "new_cards"] as const;

export function serializeBackup(tables: BackupTables, now: Date = new Date()): string {
  const backup: Backup = { app: "hanzisave", version: 1, exportedAt: now.toISOString(), tables };
  return JSON.stringify(backup);
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  const parsed = BackupSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`Not a HanziSave backup (${first.path.join(".") || "root"}: ${first.message}).`);
  }
  return parsed.data;
}

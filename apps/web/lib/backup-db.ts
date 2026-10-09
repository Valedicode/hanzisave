import { db } from "./db";
import { BACKUP_TABLES, parseBackup, serializeBackup, type BackupTables } from "./backup";

// Reads every table into one JSON string.
export async function exportBackup(): Promise<string> {
  const entries = await Promise.all(BACKUP_TABLES.map(async (name) => [name, await db.table(name).toArray()] as const));
  return serializeBackup(Object.fromEntries(entries) as unknown as BackupTables);
}

// Replaces the whole library with the backup's contents. The file is fully
// validated before anything is cleared, and the swap is one transaction, so a
// bad file or a failure midway leaves the existing data untouched.
export async function restoreBackup(text: string): Promise<{ units: number; known: number }> {
  const backup = parseBackup(text);
  const tables = BACKUP_TABLES.map((name) => db.table(name));
  await db.transaction("rw", tables, async () => {
    for (const name of BACKUP_TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkAdd(backup.tables[name]);
    }
  });
  return { units: backup.tables.deck_units.length, known: backup.tables.known.length };
}

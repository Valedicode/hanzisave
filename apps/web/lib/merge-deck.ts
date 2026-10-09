// Merges a fresh Anki export into the cards already in the library without
// discarding work: rewrites and approvals survive, new notes arrive as pending,
// and cards whose source changed in Anki are flagged instead of overwritten.

import type { DeckUnit } from "./deck-plan";
import type { DeckUnitRecord } from "./db";

export interface MergeResult {
  add: DeckUnit[];
  update: { id: number; changes: Partial<DeckUnitRecord> }[];
  addedFronts: string[];
  changedFronts: string[]; // source changed in Anki
  staleFronts: string[]; // ...and already rewritten, so the rewrite may be out of date
  missingFronts: string[]; // no longer in the export
  unchanged: number;
}

// Fronts can repeat (the same word as two separate notes), so a card is
// identified by its front plus which occurrence of that front it is.
function keyed<T extends { front: string }>(items: T[]): Map<string, T> {
  const seen = new Map<string, number>();
  const out = new Map<string, T>();
  for (const item of items) {
    const n = (seen.get(item.front) ?? 0) + 1;
    seen.set(item.front, n);
    out.set(`${item.front}#${n}`, item);
  }
  return out;
}

const REWRITTEN: DeckUnitRecord["status"][] = ["generated", "approved"];

export function mergeDeck(existing: DeckUnitRecord[], incoming: DeckUnit[]): MergeResult {
  const current = keyed([...existing].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)));
  const fresh = keyed(incoming);

  const result: MergeResult = {
    add: [],
    update: [],
    addedFronts: [],
    changedFronts: [],
    staleFronts: [],
    missingFronts: [],
    unchanged: 0,
  };

  for (const [key, unit] of fresh) {
    const old = current.get(key);
    if (!old) {
      result.add.push(unit);
      result.addedFronts.push(unit.front);
      continue;
    }

    const changes: Partial<DeckUnitRecord> = {};
    const sourceChanged = old.oldBack !== unit.oldBack || old.type !== unit.type;
    if (sourceChanged) {
      changes.oldBack = unit.oldBack;
      changes.type = unit.type;
      changes.format = unit.format;
      result.changedFronts.push(unit.front);
      if (REWRITTEN.includes(old.status)) {
        changes.stale = true;
        result.staleFronts.push(unit.front);
      }
    }
    // Metadata that doesn't affect the rewrite is refreshed silently.
    if (old.tags !== unit.tags) changes.tags = unit.tags;
    if (old.splitFrom !== unit.splitFrom) changes.splitFrom = unit.splitFrom;
    if (old.sourceRow !== unit.sourceRow) changes.sourceRow = unit.sourceRow;
    if (old.forms.join("|") !== unit.forms.join("|")) changes.forms = unit.forms;
    if (old.missing) changes.missing = false;

    if (Object.keys(changes).length > 0) result.update.push({ id: old.id!, changes });
    if (!sourceChanged) result.unchanged++;
  }

  for (const [key, old] of current) {
    if (fresh.has(key)) continue;
    result.missingFronts.push(old.front);
    if (!old.missing) result.update.push({ id: old.id!, changes: { missing: true } });
  }

  return result;
}

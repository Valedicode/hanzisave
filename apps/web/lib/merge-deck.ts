// Merges a fresh Anki export into the cards already in the library without
// discarding work: rewrites and approvals survive, new notes arrive as pending,
// and cards whose source changed in Anki are flagged instead of overwritten.
//
// Cards are paired by Anki note id when both sides have one (exact, survives
// edited fronts and duplicate words); cards without an id fall back to their
// front text, and adopt the id when they get matched.

import type { DeckUnit } from "./deck-plan";
import type { DeckUnitRecord } from "./db";

export interface MergeResult {
  add: DeckUnit[];
  update: { id: number; changes: Partial<DeckUnitRecord> }[];
  addedFronts: string[];
  changedFronts: string[]; // source changed in Anki
  staleFronts: string[]; // ...and already rewritten, so the rewrite may be out of date
  importedFronts: string[]; // the user's own approved rewrite came back from Anki unchanged
  missingFronts: string[]; // no longer in the export
  unchanged: number;
}

// A note split into several cards shares one note id, so the part's front is
// part of the identity; an unsplit card is identified by the note id alone.
function idKey(u: { ankiNoteId?: number; splitFrom?: string; front: string }): string | undefined {
  if (u.ankiNoteId === undefined) return undefined;
  return u.splitFrom ? `n${u.ankiNoteId}|${u.front}` : `n${u.ankiNoteId}`;
}

// Fronts can repeat (the same word as two separate notes), so without ids a
// card is identified by its front plus which occurrence of that front it is.
function frontKeys<T extends { front: string }>(items: T[]): Map<string, T> {
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
  const olds = [...existing].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const pairs: [DeckUnitRecord, DeckUnit][] = [];
  const pairedOld = new Set<DeckUnitRecord>();
  const pairedNew = new Set<DeckUnit>();

  // Pass 1: exact, by Anki note id.
  const oldById = new Map<string, DeckUnitRecord>();
  for (const o of olds) {
    const k = idKey(o);
    if (k && !oldById.has(k)) oldById.set(k, o);
  }
  for (const n of incoming) {
    const k = idKey(n);
    const o = k ? oldById.get(k) : undefined;
    if (o && !pairedOld.has(o)) {
      pairs.push([o, n]);
      pairedOld.add(o);
      pairedNew.add(n);
    }
  }

  // Pass 2: cards still without a match, by identical front and Back. This keeps
  // two copies of the same word (two notes) from trading ids when they are
  // listed in a different order.
  const sameContent = (a: { front: string; oldBack: string }) => `${a.front}\u0000${a.oldBack}`;
  const oldByContent = new Map<string, DeckUnitRecord[]>();
  for (const o of olds) {
    if (pairedOld.has(o)) continue;
    const k = sameContent(o);
    oldByContent.set(k, [...(oldByContent.get(k) ?? []), o]);
  }
  for (const n of incoming) {
    if (pairedNew.has(n)) continue;
    const o = oldByContent.get(sameContent(n))?.shift();
    if (o) {
      pairs.push([o, n]);
      pairedOld.add(o);
      pairedNew.add(n);
    }
  }

  // Pass 3: whatever is left, by front text and occurrence.
  const oldByFront = frontKeys(olds.filter((o) => !pairedOld.has(o)));
  const newByFront = frontKeys(incoming.filter((n) => !pairedNew.has(n)));
  for (const [key, n] of newByFront) {
    const o = oldByFront.get(key);
    if (o) {
      pairs.push([o, n]);
      pairedOld.add(o);
      pairedNew.add(n);
    }
  }

  const result: MergeResult = {
    add: incoming.filter((n) => !pairedNew.has(n)),
    update: [],
    addedFronts: [],
    changedFronts: [],
    staleFronts: [],
    importedFronts: [],
    missingFronts: [],
    unchanged: 0,
  };
  result.addedFronts = result.add.map((n) => n.front);

  for (const [old, unit] of pairs) {
    const changes: Partial<DeckUnitRecord> = {};
    // After the user imports an approved rewrite into Anki, the next export carries that
    // same text as the card's Back. That is the rewrite landing, not an edit in Anki.
    const backChanged = old.oldBack !== unit.oldBack;
    const rewriteLanded = backChanged && old.newBack !== undefined && unit.oldBack.trim() === old.newBack.trim();
    if (rewriteLanded) {
      changes.oldBack = unit.oldBack;
      changes.format = unit.format;
      result.importedFronts.push(unit.front);
    }
    const sourceChanged =
      (backChanged && !rewriteLanded) || old.type !== unit.type || old.front !== unit.front;
    if (sourceChanged) {
      changes.front = unit.front;
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
    if (unit.ankiNoteId !== undefined && old.ankiNoteId !== unit.ankiNoteId) changes.ankiNoteId = unit.ankiNoteId;
    if (unit.ankiGuid !== undefined && old.ankiGuid !== unit.ankiGuid) changes.ankiGuid = unit.ankiGuid;
    if (old.missing) changes.missing = false;

    if (Object.keys(changes).length > 0) result.update.push({ id: old.id!, changes });
    if (!sourceChanged) result.unchanged++;
  }

  for (const old of olds) {
    if (pairedOld.has(old)) continue;
    // Component cards are made here and only reach Anki when imported; until then
    // they are not "missing" from the export, just not there yet.
    if (old.componentOf && old.ankiNoteId === undefined) continue;
    result.missingFronts.push(old.front);
    if (!old.missing) result.update.push({ id: old.id!, changes: { missing: true } });
  }

  return result;
}

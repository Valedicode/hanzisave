// Turns a parsed Anki export into the cards HanziSave will hold: applies the
// split decisions (official ones automatically, proposals unless overridden)
// and derives the known set from the resulting fronts.

import type { ImportedNote, NoteFormat, ParsedDeck } from "./anki-import";
import { planSplit, type Hsk30Index, type SplitPlan } from "./split-front";

export type CardType = "word" | "grammar";

export interface DeckUnit {
  front: string;
  forms: string[]; // every form that counts as "known" for this card
  type: CardType;
  format: NoteFormat;
  oldBack: string;
  tags: string;
  sourceRow: number;
  splitFrom?: string; // original combined front, when this card came from a split
}

export interface KnownItem {
  item: string;
  type: CardType;
}

export interface NotePlan {
  note: ImportedNote;
  split: SplitPlan;
  action: "none" | "keep" | "split"; // after overrides
}

export interface DeckPlan {
  notes: NotePlan[];
  units: DeckUnit[];
  known: KnownItem[];
}

export function buildDeckPlan(
  deck: ParsedDeck,
  index: Hsk30Index,
  splitOverrides: ReadonlyMap<number, "keep" | "split"> = new Map(),
  typeOverrides: ReadonlyMap<number, CardType> = new Map(),
): DeckPlan {
  const notes: NotePlan[] = [];
  const units: DeckUnit[] = [];

  for (const note of deck.notes) {
    const split = planSplit(note.front, index);
    const override = split.status === "proposal" ? splitOverrides.get(note.row) : undefined;
    const action = split.action === "none" ? "none" : (override ?? split.action);
    notes.push({ note, split, action });

    const base = { format: note.format, oldBack: note.backText, tags: note.tags, sourceRow: note.row };
    const noteType: CardType = typeOverrides.get(note.row) ?? (note.isGrammar ? "grammar" : "word");

    if (action === "split") {
      for (const part of split.parts) {
        units.push({
          ...base,
          front: part.text,
          forms: [part.text],
          type: part.grammar ? "grammar" : "word",
          splitFrom: note.front,
        });
      }
    } else {
      units.push({ ...base, front: note.front, forms: split.parts.map((p) => p.text), type: noteType });
    }
  }

  const seen = new Set<string>();
  const known: KnownItem[] = [];
  for (const u of units) {
    for (const item of u.forms) {
      const key = `${u.type}:${item}`;
      if (seen.has(key)) continue;
      seen.add(key);
      known.push({ item, type: u.type });
    }
  }
  return { notes, units, known };
}

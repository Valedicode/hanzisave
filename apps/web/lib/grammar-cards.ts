// What is sent to the card model for a grammar point, and what the card's front is.

import { grammarPoint, type GrammarPoint } from "./grammar";
import type { CardRequest } from "./llm/types";

// The item field of a request is at most 60 characters (card-schema.ts).
const MAX_ITEM = 60;

// The front of a grammar card: the pattern as the deck writes it (一边……一边……), or for sentence
// structures the catalog name with its English name (连动句1 (serial verb sentence)), since the
// Chinese label alone does not say which structure it is.
export function grammarFront(point: GrammarPoint, frame?: string): string {
  if (frame) return frame.replace(/[，,\s]/g, "");
  const name = point.name.replace(/[“”]/g, "");
  return point.en ? `${name} (${point.en})` : name;
}

// The level as the card spec wants it, copied from the catalog: "3", or "7-9" for the top band.
export const levelParam = (level: number): string => (level >= 7 ? "7-9" : String(level));

// A structure's name alone does not say which use is meant (比较句2), so the catalog's description is added
// after the English name, as the spec does for a marker with several functions. Patterns say it themselves.
function grammarItem(front: string, point: GrammarPoint): string {
  if (point.frames?.length) return front;
  const name = point.name.replace(/[“”]/g, "");
  const head = point.en ? `${name} (${point.en}` : `${name} (`;
  // A few of the list's names are long sentences themselves; the English name then stands for the point.
  const bare = point.en ? (`${head})`.length > MAX_ITEM ? point.en : `${head})`) : name;
  const room = MAX_ITEM - head.length - 3; // ": " and the closing bracket
  if (!point.desc || room < 8) return bare.slice(0, MAX_ITEM);
  const desc = point.desc.length > room ? `${point.desc.slice(0, room - 1)}…` : point.desc;
  return point.en ? `${head}: ${desc})` : `${head}${desc})`;
}

export function grammarRequest(pointId: string, front: string, sentence: string): CardRequest | null {
  const point = grammarPoint(pointId);
  if (!point) return null;
  return {
    item: grammarItem(front, point),
    type: "grammar",
    context: sentence.slice(0, 400),
    hsk: levelParam(point.level),
  };
}

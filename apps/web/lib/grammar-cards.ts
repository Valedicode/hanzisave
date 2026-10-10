// What is sent to the card model for a grammar point, and what the card's front is.

import { grammarPoint, type GrammarPoint } from "./grammar";
import type { CardRequest } from "./llm/types";

// The item field of a request is at most 60 characters (card-schema.ts).
const MAX_ITEM = 60;

// The front of a grammar card: the pattern as the deck writes it (一边……一边……), or for sentence
// structures the catalog name (把字句1).
export function grammarFront(point: GrammarPoint, frame?: string): string {
  if (frame) return frame.replace(/[，,\s]/g, "");
  return point.name.replace(/[“”]/g, "");
}

// The level as the card spec wants it, copied from the catalog: "3", or "7-9" for the top band.
export const levelParam = (level: number): string => (level >= 7 ? "7-9" : String(level));

// A structure's name alone does not say which use is meant (比较句2), so the catalog's description is added,
// as the spec does for a marker with several functions. Patterns say it themselves.
function grammarItem(front: string, point: GrammarPoint): string {
  if (point.frames?.length || !point.desc) return front;
  const room = MAX_ITEM - front.length - 3;
  if (room < 8) return front;
  const desc = point.desc.length > room ? `${point.desc.slice(0, room - 1)}…` : point.desc;
  return `${front} (${desc})`;
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

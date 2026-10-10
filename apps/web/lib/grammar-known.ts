// Connects what the learner already has to the grammar catalog.

import { grammarPoints, type GrammarPoint } from "./grammar";
import { sameFrame } from "./grammar-detect";

// The catalog points a grammar front from the deck stands for: 又…又… is 又……又…… (and its level-3 clause
// version, which is the same pattern). Fronts with slots or a single anchor (所 + verb) match nothing.
export function matchDeckFront(front: string): GrammarPoint[] {
  return grammarPoints.filter((p) => p.frames?.some((frame) => sameFrame(front, frame)));
}

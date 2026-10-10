// Finds grammar points in a text by matching the catalog's surface frames (又……又……, 虽然……，但是……).
// Points without a literal frame (把, 被, 比, complements, 是……的) are left to the model.

import { splitSentences } from "./analyze";
import { grammarPoints, type GrammarPoint } from "./grammar";

export interface GrammarHit {
  point: GrammarPoint;
  count: number; // sentences it appears in
  sentence: string; // first sentence it appears in
  matched: string; // the part of that sentence the frame matched
}

export interface GrammarScanOptions {
  known?: ReadonlySet<string>; // point ids the learner already has
  levelFloor?: number; // also treat points at or below this HSK level as known
}

// How many characters a "……" may stand for.
const MAX_GAP = 20;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HAN_ONLY = /^\p{Script=Han}+$/u;

// A frame such as "不仅/不光……，还/而且……" becomes a regex. The notation is: "/" separates
// alternatives, （…） is optional, "……" is a stretch of anything. Frames with slots (X, Y, 动词) or
// fewer than two required anchors are too loose to match by pattern and give null.
export function compileFrame(frame: string): RegExp | null {
  const parts: string[] = [];
  let anchors = 0;
  const cleaned = frame.replace(/[，,\s]/g, "");
  const tokens = cleaned.match(/…+|（[^）]*）|\([^)]*\)|[^…（(]+/g);
  if (!tokens) return null;
  for (const token of tokens) {
    if (token.startsWith("…")) {
      if (parts.length > 0 && parts[parts.length - 1] !== "GAP") parts.push("GAP");
      continue;
    }
    const optional = token.startsWith("（") || token.startsWith("(");
    const body = optional ? token.slice(1, -1) : token;
    const alternatives = body.split("/").filter(Boolean);
    if (alternatives.length === 0 || !alternatives.every((a) => HAN_ONLY.test(a))) return null;
    const group = `(?:${alternatives.map(escape).join("|")})`;
    if (optional) parts.push(`${group}?`);
    else {
      parts.push(group);
      anchors++;
    }
  }
  if (anchors < 2) return null;
  while (parts[parts.length - 1] === "GAP") parts.pop();
  return new RegExp(parts.map((p) => (p === "GAP" ? `.{1,${MAX_GAP}}?` : p)).join(""));
}

interface CompiledPoint {
  point: GrammarPoint;
  patterns: RegExp[];
}

let compiled: CompiledPoint[] | null = null;

// The catalog points that can be found by pattern matching, with their frames compiled once.
export function frameMatchers(): CompiledPoint[] {
  compiled ??= grammarPoints.flatMap((point) => {
    const patterns = (point.frames ?? []).map(compileFrame).filter((r): r is RegExp => r !== null);
    return patterns.length > 0 ? [{ point, patterns }] : [];
  });
  return compiled;
}

// New grammar points in a text, in order of first appearance.
export function detectGrammar(text: string, { known, levelFloor = 0 }: GrammarScanOptions = {}): GrammarHit[] {
  const matchers = frameMatchers().filter(({ point }) => !known?.has(point.id) && point.level > levelFloor);
  const found = new Map<string, GrammarHit>();
  for (const sentence of splitSentences(text)) {
    const here: { point: GrammarPoint; matched: string }[] = [];
    for (const { point, patterns } of matchers) {
      for (const pattern of patterns) {
        const m = pattern.exec(sentence);
        if (!m) continue;
        here.push({ point, matched: m[0] });
        break;
      }
    }
    // 虽……但 also matches inside 虽然……但是; of two points of one kind the one with the longer span is the real one.
    for (const { point, matched } of here) {
      const inside = here.some((o) => o.point.group === point.group && o.matched.length > matched.length && o.matched.includes(matched));
      if (inside) continue;
      const hit = found.get(point.id);
      if (hit) hit.count++;
      else found.set(point.id, { point, count: 1, sentence, matched });
    }
  }
  return [...found.values()];
}

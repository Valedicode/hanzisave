// Finds grammar points in a text by matching the catalog's surface frames (又……又……, 虽然……，但是……).
// Points without a literal frame (把, 被, 比, complements, 是……的) are left to the model.

import { splitSentences } from "./analyze";
import { grammarPoint, grammarPoints, type GrammarPoint } from "./grammar";

export interface GrammarHit {
  point: GrammarPoint;
  count: number; // sentences it appears in
  sentence: string; // first sentence it appears in
  matched: string; // the part of that sentence the frame matched; empty for points the model found
  frame?: string; // the catalog frame that matched, e.g. 一边……，一边……
}

export interface GrammarScanOptions {
  known?: ReadonlySet<string>; // point ids the learner already has
  levelFloor?: number; // also treat points at or below this HSK level as known
}

// How many characters a "……" may stand for.
const MAX_GAP = 20;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HAN_ONLY = /^\p{Script=Han}+$/u;

// One piece of a frame: a stretch of anything (……), or literal alternatives that are required or optional.
export type FramePart = { gap: true } | { alts: string[]; optional: boolean };

// Reads a frame such as "不仅/不光……，还/而且……". The notation is: "/" separates alternatives,
// （…） is optional, "……" is a stretch of anything. Frames with slots (X, Y, 动词) or fewer than
// two required anchors are too loose to match by pattern and give null. A leading or trailing
// gap carries no information and is dropped.
export function parseFrame(frame: string): FramePart[] | null {
  const parts: FramePart[] = [];
  let anchors = 0;
  const cleaned = frame.replace(/[，,\s、？?。！!]/g, "").replace(/\.{2,}|⋯+/g, "…");
  const tokens = cleaned.match(/…+|（[^）]*）|\([^)]*\)|[^…（(]+/g);
  if (!tokens) return null;
  for (const token of tokens) {
    if (token.startsWith("…")) {
      if (parts.length > 0 && !("gap" in parts[parts.length - 1])) parts.push({ gap: true });
      continue;
    }
    const optional = token.startsWith("（") || token.startsWith("(");
    const body = optional ? token.slice(1, -1) : token;
    const alts = body.split("/").filter(Boolean);
    if (alts.length === 0 || !alts.every((a) => HAN_ONLY.test(a))) return null;
    parts.push({ alts, optional });
    if (!optional) anchors++;
  }
  if (anchors < 2) return null;
  while (parts.length > 0 && "gap" in parts[parts.length - 1]) parts.pop();
  return parts;
}

// A frame as a regex that finds it in a sentence.
export function compileFrame(frame: string): RegExp | null {
  const parts = parseFrame(frame);
  if (!parts) return null;
  return new RegExp(
    parts
      .map((p) => {
        if ("gap" in p) return `.{1,${MAX_GAP}}?`;
        const group = `(?:${p.alts.map(escape).join("|")})`;
        return p.optional ? `${group}?` : group;
      })
      .join(""),
  );
}

// Whether a pattern as it is written on a card front (又…又…) is the frame of a catalog point:
// the same required pieces in the same order with gaps in the same places, where each piece on
// the front is one of the frame's alternatives. 越来越…… is not 越……越……: it has no gap between.
export function sameFrame(front: string, frame: string): boolean {
  const a = parseFrame(front);
  // With the optional parts out, the gaps on either side of one run together.
  const b = parseFrame(frame)
    ?.filter((p) => "gap" in p || !p.optional)
    .filter((p, i, all) => !("gap" in p && i > 0 && "gap" in all[i - 1]));
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    if ("gap" in p || "gap" in q) return "gap" in p && "gap" in q;
    return p.alts.every((alt) => q.alts.includes(alt));
  });
}

interface CompiledPoint {
  point: GrammarPoint;
  patterns: { frame: string; regex: RegExp }[];
}

let compiled: CompiledPoint[] | null = null;

// The catalog points that can be found by pattern matching, with their frames compiled once.
export function frameMatchers(): CompiledPoint[] {
  compiled ??= grammarPoints.flatMap((point) => {
    const patterns = (point.frames ?? []).flatMap((frame) => {
      const regex = compileFrame(frame);
      return regex ? [{ frame, regex }] : [];
    });
    return patterns.length > 0 ? [{ point, patterns }] : [];
  });
  return compiled;
}

// New grammar points in a text, in order of first appearance.
export function detectGrammar(text: string, { known, levelFloor = 0 }: GrammarScanOptions = {}): GrammarHit[] {
  const matchers = frameMatchers().filter(({ point }) => !known?.has(point.id) && point.level > levelFloor);
  const found = new Map<string, GrammarHit>();
  for (const sentence of splitSentences(text)) {
    const here: { point: GrammarPoint; matched: string; frame: string }[] = [];
    for (const { point, patterns } of matchers) {
      for (const { frame, regex } of patterns) {
        const m = regex.exec(sentence);
        if (!m) continue;
        here.push({ point, matched: m[0], frame });
        break;
      }
    }
    // 虽……但 also matches inside 虽然……但是; of two points of one kind the one with the longer span is the real one.
    for (const { point, matched, frame } of here) {
      const inside = here.some((o) => o.point.group === point.group && o.matched.length > matched.length && o.matched.includes(matched));
      if (inside) continue;
      const hit = found.get(point.id);
      if (hit) hit.count++;
      else found.set(point.id, { point, count: 1, sentence, matched, frame });
    }
  }
  return [...found.values()];
}

// The points rules cannot find (no usable frame) that are still new to the learner: what the model is asked about.
export function structureCandidates({ known, levelFloor = 0 }: GrammarScanOptions = {}): GrammarPoint[] {
  const byRules = new Set(frameMatchers().map(({ point }) => point.id));
  return grammarPoints.filter((p) => !byRules.has(p.id) && !known?.has(p.id) && p.level > levelFloor);
}

// The model's findings as list entries; with no frame there is no matched span to point at.
export function modelHits(findings: { id: string; sentence: string }[]): GrammarHit[] {
  return findings.flatMap(({ id, sentence }) => {
    const point = grammarPoint(id);
    return point ? [{ point, count: 1, sentence, matched: "" }] : [];
  });
}

import catalogData from "@/public/grammar-catalog.json";
import type { HskLevel } from "./lexicon";

// The HSK 3.0 grammar list (2021), reduced to the points a learner studies as patterns
// (built by scripts/build-grammar-catalog.mjs). Word classes such as modal verbs are not in it.
export interface GrammarPoint {
  id: string; // "g" + the row number in the official list, stable across rebuilds
  level: HskLevel; // 7 stands for the whole 7-9 band
  group: string; // 特殊句型, 复句, 补语, 固定格式, 口语格式, ...
  name: string; // what the point is called: "比较句2", "又……又……"
  en?: string; // English name of a structure or clause type; fixed patterns need none
  brief?: string; // one line of English on what the structure does; set wherever `en` is
  desc: string; // the list's formal description; it has no explanations or examples
  frames?: string[]; // surface templates, for points that pattern matching can find
}

export const grammarPoints = catalogData as GrammarPoint[];

const byId = new Map(grammarPoints.map((p) => [p.id, p]));

export const grammarPoint = (id: string): GrammarPoint | undefined => byId.get(id);

// Every point up to and including a level, e.g. what "I know HSK 3 grammar" covers.
export const pointsUpToLevel = (level: number): GrammarPoint[] => grammarPoints.filter((p) => p.level <= level);

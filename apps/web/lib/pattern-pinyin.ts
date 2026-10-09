// Adds pinyin to the lines under "Patterns:" on a card Back:
//   - 制定/做 + 计划 (make a plan)
// becomes
//   - 制定/做 + 计划 [zhìdìng/zuò + jìhuà] (make a plan)
// Pinyin goes in square brackets so the English gloss keeps its parentheses. The pinyin is
// computed, not asked of the model, so it is the same for old and new cards and costs nothing.

// Grammar particles standing alone in a pattern take their grammatical reading; a
// converter reads them in isolation (了 as liǎo, 得 as dé), which is wrong here.
const PARTICLES: Record<string, string> = {
  了: "le",
  的: "de",
  得: "de",
  地: "de",
  着: "zhe",
  过: "guo",
  吗: "ma",
  呢: "ne",
  吧: "ba",
  啦: "la",
};

export type HanToPinyin = (hanRun: string) => string;

const BULLET = /^(\s*-\s+)(.*)$/;
const HAS_PINYIN = /\[[^\]]*\]/;
const HAN_RUN = /\p{Script=Han}+/gu;

function withPinyinLine(line: string, toPinyin: HanToPinyin): string {
  const bullet = BULLET.exec(line);
  if (!bullet) return line;
  const body = bullet[2];
  if (HAS_PINYIN.test(body)) return line; // already done

  // "<pattern> (<gloss>)": the gloss is the last parenthesised group, when there is one.
  const parts = /^(.*?)(?:\s+\(([^()]*)\))?\s*$/.exec(body);
  const pattern = parts?.[1] ?? body;
  const gloss = parts?.[2];
  if (!/\p{Script=Han}/u.test(pattern)) return line;

  const pinyin = pattern.replace(HAN_RUN, (run) => PARTICLES[run] ?? toPinyin(run));
  return `${bullet[1]}${pattern} [${pinyin}]${gloss !== undefined ? ` (${gloss})` : ""}`;
}

export function addPatternPinyin(back: string, toPinyin: HanToPinyin): string {
  let inPatterns = false;
  return back
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("Patterns:")) {
        inPatterns = true;
        return line;
      }
      if (inPatterns) {
        if (BULLET.test(line)) return withPinyinLine(line, toPinyin);
        inPatterns = false; // a blank line or the next label ends the section
      }
      return line;
    })
    .join("\n");
}

// The converter is loaded on demand: its dictionary is large and only needed when a card is made.
export async function withPatternPinyin(back: string): Promise<string> {
  const { pinyin } = await import("pinyin-pro");
  return addPatternPinyin(back, (run) => pinyin(run, { toneType: "symbol", type: "array" }).join(""));
}

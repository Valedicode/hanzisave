import { checkCardFormat } from "./card-format";
import type { CardRequest, LlmProvider } from "./llm/types";

export type CardResult =
  | { ok: true; back: string }
  | { ok: false; back: string; problems: string[] };

// Generates a card and validates it against the spec. Models occasionally
// return an incomplete or all-"unsure" card; one retry is cheap, so try twice.
export async function generateValidCard(
  provider: LlmProvider,
  req: CardRequest,
  spec: string,
  attempts = 2,
): Promise<CardResult> {
  let back = "";
  let problems: string[] = [];
  for (let i = 0; i < attempts; i++) {
    back = await provider.generateCard(req, spec);
    problems = checkCardFormat(back, req.type).problems;
    if (problems.length === 0) return { ok: true, back };
  }
  return { ok: false, back, problems };
}

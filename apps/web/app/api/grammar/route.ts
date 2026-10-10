import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { grammarPoint } from "@/lib/grammar";
import { LlmError, type GrammarCandidate } from "@/lib/llm/types";
import { provider } from "@/lib/llm/provider";

export const maxDuration = 30;

const MAX_TEXT = 3000;
const MAX_POINTS = 250;

// POST { text: string, ids: string[] } -> { points: { id, sentence }[] }: the catalog points (by id) the
// text uses, each with the sentence that uses it. The model can only name ids it was given.
export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; ids?: unknown } | null;
  if (typeof body?.text !== "string" || !Array.isArray(body.ids)) {
    return NextResponse.json({ error: "text and ids are required" }, { status: 400 });
  }
  const candidates = [...new Set(body.ids.filter((id): id is string => typeof id === "string"))]
    .slice(0, MAX_POINTS)
    .flatMap((id): GrammarCandidate[] => {
      const point = grammarPoint(id);
      return point ? [{ id, name: point.name, desc: point.desc }] : [];
    });

  try {
    return NextResponse.json({ points: await provider.findGrammar(body.text.slice(0, MAX_TEXT), candidates) });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("grammar check failed:", error);
    return NextResponse.json({ error: "grammar check failed" }, { status: 500 });
  }
}

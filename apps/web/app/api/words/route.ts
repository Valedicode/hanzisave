import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { LlmError } from "@/lib/llm/types";
import { provider } from "@/lib/llm/provider";

export const maxDuration = 30;

const MAX_CANDIDATES = 100;
const CANDIDATE = /^\p{Script=Han}{1,8}$/u;

// POST { words: string[] } -> { words: string[] }: the ones that are real standalone words.
export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { words?: unknown } | null;
  if (!Array.isArray(body?.words)) {
    return NextResponse.json({ error: "words must be a list" }, { status: 400 });
  }
  const candidates = [...new Set(body.words.filter((w): w is string => typeof w === "string" && CANDIDATE.test(w)))].slice(0, MAX_CANDIDATES);

  try {
    return NextResponse.json({ words: await provider.checkWords(candidates) });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("word check failed:", error);
    return NextResponse.json({ error: "word check failed" }, { status: 500 });
  }
}

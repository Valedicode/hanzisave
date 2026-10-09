import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { LlmError } from "@/lib/llm/types";
import { provider } from "@/lib/llm/provider";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { word?: unknown; sentence?: unknown } | null;
  const word = typeof body?.word === "string" ? body.word.trim() : "";
  const sentence = typeof body?.sentence === "string" ? body.sentence.trim().slice(0, 400) : "";
  if (!word || !sentence) {
    return NextResponse.json({ error: "word and sentence are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await provider.generateGloss({ word, sentence }));
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("gloss request failed:", error);
    return NextResponse.json({ error: "gloss request failed" }, { status: 500 });
  }
}

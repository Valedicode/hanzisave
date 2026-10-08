import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { CardRequestSchema } from "@/lib/card-schema";
import { loadCardSpec } from "@/lib/card-spec";
import { LlmError } from "@/lib/llm/types";
import { createOpenAiProvider } from "@/lib/llm/openai";

const provider = createOpenAiProvider();

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const parsed = CardRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid card request", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const back = await provider.generateCard(parsed.data, loadCardSpec());
    return NextResponse.json({ back });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("card request failed:", error);
    return NextResponse.json({ error: "card request failed" }, { status: 500 });
  }
}

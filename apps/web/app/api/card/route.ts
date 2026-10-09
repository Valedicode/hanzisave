import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { checkCardFormat } from "@/lib/card-format";
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
    const spec = loadCardSpec();
    // Models occasionally return a card that is incomplete or all "unsure"; one retry is cheap.
    let back = await provider.generateCard(parsed.data, spec);
    let { problems } = checkCardFormat(back, parsed.data.type);
    if (problems.length > 0) {
      back = await provider.generateCard(parsed.data, spec);
      ({ problems } = checkCardFormat(back, parsed.data.type));
    }
    if (problems.length > 0) {
      return NextResponse.json({ error: "model returned an unusable card", problems, back }, { status: 502 });
    }
    return NextResponse.json({ back });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("card request failed:", error);
    return NextResponse.json({ error: "card request failed" }, { status: 500 });
  }
}

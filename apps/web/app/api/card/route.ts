import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { generateValidCard } from "@/lib/card-service";
import { CardRequestSchema } from "@/lib/card-schema";
import { loadCardSpec } from "@/lib/card-spec";
import { LlmError } from "@/lib/llm/types";
import { provider } from "@/lib/llm/provider";

// Grammar cards take up to ~8.5 s and a failed card is retried once, so allow well past the default limit.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const parsed = CardRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid card request", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await generateValidCard(provider, parsed.data, loadCardSpec());
    if (!result.ok) {
      return NextResponse.json(
        { error: "model returned an unusable card", problems: result.problems, back: result.back },
        { status: 502 },
      );
    }
    return NextResponse.json({ back: result.back });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("card request failed:", error);
    return NextResponse.json({ error: "card request failed" }, { status: 500 });
  }
}

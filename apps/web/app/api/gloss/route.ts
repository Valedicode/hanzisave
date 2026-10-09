import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { GlossSchema, type GlossRequest } from "@/lib/gloss-schema";

const client = new OpenAI();

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<GlossRequest>;
  const { word, sentence } = body;
  if (!word || !sentence) {
    return NextResponse.json({ error: "word and sentence are required" }, { status: 400 });
  }

  try {
    const completion = await client.chat.completions.parse({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "user",
          content: `Chinese sentence: ${sentence}\nWord to gloss: ${word}\nGive the pinyin, a short English gloss for this word as used in this sentence, and one new short example sentence using the word.`,
        },
      ],
      response_format: zodResponseFormat(GlossSchema, "gloss"),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      return NextResponse.json({ error: "model returned no parsable output" }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing or invalid" }, { status: 401 });
    }
    if (error instanceof OpenAI.RateLimitError) {
      return NextResponse.json({ error: "rate limited, try again shortly" }, { status: 429 });
    }
    if (error instanceof OpenAI.BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 502 });
    }
    console.error("gloss request failed:", error);
    return NextResponse.json({ error: "gloss request failed" }, { status: 500 });
  }
}

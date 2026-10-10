import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { provider } from "@/lib/llm/provider";
import { LlmError } from "@/lib/llm/types";

// Phone photos are resized in the browser before upload; this is a safety cap
// (and stays under typical serverless request limits).
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const maxDuration = 60;

// POST the raw image bytes with their content type; responds with the Chinese text found.
export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(mime)) {
    return NextResponse.json({ error: `unsupported image type "${mime}"` }, { status: 415 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "empty upload" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "image too large" }, { status: 413 });

  try {
    const text = await provider.extractText({ mime, data: bytes.toString("base64") });
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof LlmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("ocr request failed:", error);
    return NextResponse.json({ error: "ocr request failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { hasAccess } from "@/lib/access";
import { readApkg } from "@/lib/apkg";

export const runtime = "nodejs"; // uses node:sqlite and zstd

// Collections are a few hundred KB; this only guards against accidents.
const MAX_BYTES = 50 * 1024 * 1024;

// POST the raw .apkg bytes; responds with the notes and their Anki ids.
export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "empty upload" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 });

  try {
    return NextResponse.json({ notes: readApkg(bytes) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not read the package";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

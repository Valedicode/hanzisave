import { readFileSync } from "node:fs";
import path from "node:path";

// The card format is personal and kept out of git. Resolution order:
//   1. CARD_SPEC       the spec text itself (what a deployment sets)
//   2. CARD_SPEC_FILE  path to a spec file
//   3. the local development copy under docs/skills
const DEV_PATH = path.resolve(process.cwd(), "../../docs/skills/anki-chinese-flashcard/SKILL.md");

let cached: string | undefined;

export function loadCardSpec(): string {
  if (cached) return cached;

  const inline = process.env.CARD_SPEC;
  const file = process.env.CARD_SPEC_FILE || DEV_PATH;
  let spec = inline;
  if (!spec) {
    try {
      spec = readFileSync(file, "utf8");
    } catch {
      throw new Error(`Card spec not found. Set CARD_SPEC or CARD_SPEC_FILE (tried ${file}).`);
    }
  }

  // Re-read on every call in development so edits to the spec apply immediately.
  if (process.env.NODE_ENV === "production") cached = spec;
  return spec;
}

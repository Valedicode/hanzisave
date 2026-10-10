import { readFileSync } from "node:fs";
import path from "node:path";

// The card format is personal and kept out of git. Resolution order:
//   1. CARD_SPEC       the spec text itself (what a deployment sets)
//   2. CARD_SPEC_FILE  path to a spec file (development and scripts only)
//   3. the local development copy under docs/skills (development and scripts only)
// The file fallbacks sit behind a NODE_ENV check so the production build drops them
// instead of trying to trace a file that is not deployed.

let cached: string | undefined;

export function loadCardSpec(): string {
  if (cached) return cached;

  let spec = process.env.CARD_SPEC;
  if (!spec && process.env.NODE_ENV !== "production") {
    const file =
      process.env.CARD_SPEC_FILE ||
      path.resolve(process.cwd(), "../../docs/skills/anki-chinese-flashcard/SKILL.md");
    try {
      spec = readFileSync(file, "utf8");
    } catch {
      throw new Error(`Card spec not found. Set CARD_SPEC or CARD_SPEC_FILE (tried ${file}).`);
    }
  }
  if (!spec) throw new Error("Card spec not found. Set CARD_SPEC in the environment.");

  // Re-read on every call in development so edits to the spec apply immediately.
  if (process.env.NODE_ENV === "production") cached = spec;
  return spec;
}

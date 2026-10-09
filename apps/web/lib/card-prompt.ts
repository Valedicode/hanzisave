import type { CardRequest } from "./llm/types";

// The user message for one card. Labels mirror the Input section of the card
// spec; optional fields are omitted entirely when absent.
export function buildCardPrompt(req: CardRequest): string {
  const lines = [`item: ${req.item}`, `type: ${req.type}`];
  if (req.context) lines.push(`context: ${req.context}`);
  if (req.hsk) lines.push(`hsk: ${req.hsk}`);
  if (req.oldBack) lines.push("old_back:", req.oldBack);
  return lines.join("\n");
}

// The spec says "no code fences, no commentary"; models sometimes add fences
// anyway, so strip a single wrapping fence and surrounding whitespace.
export function cleanCardOutput(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}

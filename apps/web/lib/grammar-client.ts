import type { GrammarFinding } from "./llm/types";

export class GrammarRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GrammarRequestError";
  }
}

// Calls POST /api/grammar: which of the given catalog points the text uses.
export async function findGrammar(text: string, ids: string[], accessCode?: string): Promise<GrammarFinding[]> {
  if (ids.length === 0) return [];
  const res = await fetch("/api/grammar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify({ text, ids }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GrammarRequestError(body.error ?? `grammar check failed (${res.status})`, res.status);
  return Array.isArray(body.points) ? (body.points as GrammarFinding[]) : [];
}

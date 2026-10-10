// Calls POST /api/words; resolves to the candidates the model accepts as real standalone words.
export async function checkWords(candidates: string[], accessCode?: string): Promise<string[]> {
  if (candidates.length === 0) return [];
  const res = await fetch("/api/words", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify({ words: candidates }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `word check failed (${res.status})`);
  return Array.isArray(body.words) ? (body.words as string[]) : [];
}

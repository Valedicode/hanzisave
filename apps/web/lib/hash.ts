// Small, fast, non-cryptographic string hash (djb2) for cache keys — we only
// need low collision odds within one user's local IndexedDB, not security.
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

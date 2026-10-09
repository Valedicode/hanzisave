// The shared access code for routes that spend credit or accept uploads. Kept in
// localStorage, which can be unavailable (private windows), so every use is guarded.
const KEY = "hanzisave.accessCode";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // not remembered; the user can re-enter it
  }
}

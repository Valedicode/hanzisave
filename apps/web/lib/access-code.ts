// The shared access code for routes that spend credit or accept uploads. Kept in
// localStorage, which can be unavailable (private windows), so every use is guarded.
const KEY = "hanzisave.accessCode";
const CHANGED = "hanzisave-access-code";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(value: string): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // not remembered; the user can re-enter it
  }
  window.dispatchEvent(new Event(CHANGED));
}

// For useSyncExternalStore: lets the landing page react when the code is saved or removed.
export function subscribeAccessCode(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

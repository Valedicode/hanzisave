"use client";

import { useEffect } from "react";

// Asks the browser to keep the local library (your known words and cards) instead of clearing it under
// storage pressure. Safari only grants this to apps added to the Home Screen; elsewhere it is a no-op.
export function PersistStorage() {
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}

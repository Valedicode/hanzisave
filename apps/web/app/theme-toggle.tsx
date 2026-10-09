"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

// An explicit choice is stored on <html data-theme>; with none, the system setting applies.
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener("hanzisave-theme", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("hanzisave-theme", onChange);
  };
}

export function ThemeToggle() {
  // The server cannot know the theme, so it renders "light" and the browser corrects it.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // not remembered; it still applies until the page is closed
    }
    window.dispatchEvent(new Event("hanzisave-theme"));
  };

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      suppressHydrationWarning
    >
      <span aria-hidden="true" suppressHydrationWarning>
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}

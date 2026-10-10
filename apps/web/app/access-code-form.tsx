"use client";

import { useState, useSyncExternalStore } from "react";
import { getAccessCode, setAccessCode, subscribeAccessCode } from "@/lib/access-code";
import styles from "./access-code-form.module.css";

// The one place the access code is entered. Every other screen links here when a
// request is refused because the code is missing or wrong.
export function AccessCodeForm() {
  const stored = useSyncExternalStore(subscribeAccessCode, getAccessCode, () => "");
  const [draft, setDraft] = useState("");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const code = draft.trim();
    if (!code) return;
    setAccessCode(code);
    setDraft("");
  };

  return (
    <section id="access" className={styles.card} aria-labelledby="access-title">
      <h2 id="access-title" className={styles.title}>
        Access code
      </h2>
      <p className={styles.text}>
        Scanning photos and making cards use paid services, so they are protected by a code. Enter it once on each device.
      </p>

      <form className={styles.form} onSubmit={save}>
        <label className={styles.label} htmlFor="access-code">
          Code
        </label>
        <input
          id="access-code"
          className={styles.input}
          type="password"
          autoComplete="off"
          placeholder={stored ? "Enter a new code to replace it" : "Enter your access code"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className={styles.save} type="submit" disabled={!draft.trim()}>
          Save
        </button>
      </form>

      <p className={styles.status} role="status">
        {stored ? (
          <>
            <span className={styles.ok}>Saved on this device.</span>{" "}
            <button type="button" className={styles.remove} onClick={() => setAccessCode("")}>
              Remove
            </button>
          </>
        ) : (
          "No code saved on this device yet."
        )}
      </p>
    </section>
  );
}

"use client";

import { useState } from "react";
import styles from "./rewrite.module.css";
import { addPinyinToExistingCards } from "@/lib/pinyin-backfill";

// TRANSITIONAL. New cards already get pattern pinyin and component cards as part of
// generation. This one-time step brings the cards generated before that up to date.
// Once it has been run, delete this file, lib/pinyin-backfill.ts and the single
// <TransitionStep /> line in page.tsx.

const DONE_KEY = "hanzisave.transitionStep.v1";

function alreadyDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) !== null;
  } catch {
    return false;
  }
}

interface Props {
  busy: boolean;
  addComponents: () => Promise<void>; // split fixed expressions into component cards
  onDone: (message: string) => Promise<void> | void; // reload the list and show the message
}

export function TransitionStep({ busy, addComponents, onDone }: Props) {
  const [open, setOpen] = useState(() => !alreadyDone());
  const [working, setWorking] = useState(false);

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(DONE_KEY, "done");
    } catch {
      // not remembered; the step is simply offered again
    }
    setOpen(false);
  };

  const run = async () => {
    setWorking(true);
    const { checked, updated } = await addPinyinToExistingCards();
    await addComponents();
    await onDone(`Added pinyin to the patterns of ${updated} of ${checked} generated cards.`);
    close();
  };

  return (
    <div className={styles.panel}>
      <div>
        <b>One-time update.</b> Patterns now show their pinyin, and fixed expressions get a card for each part. New cards
        get both automatically. This brings the cards you have already generated up to date.
      </div>
      <div className={styles.row}>
        <button className={styles.primary} onClick={run} disabled={busy || working}>
          {working ? "Updating…" : "Update existing cards"}
        </button>
        <button className={styles.secondary} onClick={close} disabled={busy || working}>
          Skip
        </button>
      </div>
    </div>
  );
}

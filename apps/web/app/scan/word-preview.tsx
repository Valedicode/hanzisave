"use client";

import { useEffect, useState } from "react";
import { getAccessCode } from "@/lib/access-code";
import { getGloss, GlossRequestError } from "@/lib/gloss";
import type { Gloss } from "@/lib/gloss-schema";
import { AccessNotice } from "../access-notice";
import { Spinner } from "../spinner";
import styles from "./word-preview.module.css";

const LEVEL_COLOR: Record<number, string> = {
  1: "var(--h1)",
  2: "var(--h2)",
  3: "var(--h3)",
  4: "var(--h4)",
  5: "var(--h5)",
  6: "var(--h6)",
};

export interface PreviewTarget {
  word: string;
  level: number | null;
  sentence: string;
}

// A short look at a word as used in its sentence: pinyin, meaning and one new example.
// The parent gives each word its own key, so state starts fresh for every word.
export function WordPreview({
  target,
  onMakeCard,
  onKnow,
  onClose,
}: {
  target: PreviewTarget;
  onMakeCard: () => void;
  onKnow: () => void;
  onClose: () => void;
}) {
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGloss(target.word, target.sentence, getAccessCode() || undefined)
      .then((g) => !cancelled && setGloss(g))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof GlossRequestError && e.status === 401) setNeedsCode(true);
        else setError(e instanceof Error ? e.message : "could not load the preview");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [target.word, target.sentence]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheet} role="dialog" aria-label={`Preview of ${target.word}`}>
      <div className={styles.head}>
        <span className={styles.word}>{target.word}</span>
        {target.level !== null && (
          <span className={styles.level} style={{ background: LEVEL_COLOR[target.level] }}>
            HSK {target.level}
          </span>
        )}
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close preview">
          ✕
        </button>
      </div>

      {loading && (
        <div className={styles.hint}>
          <Spinner />
          Looking it up…
        </div>
      )}
      {needsCode && <AccessNotice />}
      {error && <div className={styles.error}>{error}</div>}
      {gloss && (
        <>
          <div className={styles.pinyin}>{gloss.pinyin}</div>
          <div className={styles.meaning}>{gloss.gloss}</div>
          <div className={styles.example}>
            <div>{gloss.example}</div>
            {gloss.examplePinyin && <div className={styles.examplePinyin}>{gloss.examplePinyin}</div>}
            {gloss.exampleTranslation && <div className={styles.exampleTranslation}>{gloss.exampleTranslation}</div>}
          </div>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onMakeCard}>
          Make card
        </button>
        <button type="button" className={styles.secondary} onClick={onKnow}>
          I know it
        </button>
      </div>
    </div>
  );
}

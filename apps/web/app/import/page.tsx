"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./import.module.css";
import { parseAnkiExport, summarize, type ParsedDeck } from "@/lib/anki-import";
import { buildDeckPlan, type CardType } from "@/lib/deck-plan";
import type { Hsk30Index } from "@/lib/split-front";
import { db } from "@/lib/db";

type Choice = "keep" | "split";

export default function ImportPage() {
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  const [fileName, setFileName] = useState("");
  const [index, setIndex] = useState<Hsk30Index | null>(null);
  const [indexError, setIndexError] = useState("");
  const [splitChoices, setSplitChoices] = useState<Map<number, Choice>>(new Map());
  const [typeChoices, setTypeChoices] = useState<Map<number, CardType>>(new Map());
  const [saved, setSaved] = useState<{ units: number; known: number } | null>(null);
  const [existing, setExisting] = useState<{ units: number; known: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/hsk30-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setIndex)
      .catch(() =>
        setIndexError(
          "HSK 3.0 index not found. Run `node scripts/build-hsk30-index.mjs` (needs ml/data/lexicon/hsk30.csv), then reload.",
        ),
      );
    Promise.all([db.deck_units.count(), db.known.count()]).then(([units, known]) =>
      setExisting({ units, known }),
    );
  }, []);

  const plan = useMemo(
    () => (deck && index ? buildDeckPlan(deck, index, splitChoices, typeChoices) : null),
    [deck, index, splitChoices, typeChoices],
  );
  const summary = useMemo(() => (deck ? summarize(deck) : null), [deck]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSaved(null);
    setSplitChoices(new Map());
    setTypeChoices(new Map());
    setFileName(file.name);
    setDeck(parseAnkiExport(await file.text()));
  };

  const setSplit = (row: number, c: Choice) =>
    setSplitChoices((prev) => new Map(prev).set(row, c));
  const setType = (row: number, t: CardType) =>
    setTypeChoices((prev) => new Map(prev).set(row, t));

  const save = async () => {
    if (!plan) return;
    // Re-importing replaces every card, including rewrites that were already generated or approved.
    const worked = await db.deck_units.where("status").notEqual("pending").count();
    if (worked > 0 && !window.confirm(`Replacing the library discards ${worked} rewritten cards. Continue?`)) return;
    setSaving(true);
    const now = Date.now();
    await db.transaction("rw", db.deck_units, db.known, async () => {
      await db.deck_units.clear();
      await db.known.where("source").equals("anki").delete();
      await db.deck_units.bulkAdd(plan.units.map((u) => ({ ...u, status: "pending" as const, createdAt: now })));
      await db.known.bulkPut(
        plan.known.map((k) => ({
          key: `${k.type}:${k.item}`,
          item: k.item,
          type: k.type,
          source: "anki" as const,
          createdAt: now,
        })),
      );
    });
    const [units, known] = await Promise.all([db.deck_units.count(), db.known.count()]);
    setSaved({ units, known });
    setExisting({ units, known });
    setSaving(false);
  };

  const combined = plan?.notes.filter((n) => n.split.action !== "none") ?? [];
  const proposals = combined.filter((n) => n.split.status === "proposal");
  const official = combined.filter((n) => n.split.status === "official");
  const grammar = plan?.notes.filter((n) => n.note.isGrammar && n.split.action === "none") ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Back
        </Link>
        <div className={styles.title}>Import Anki deck</div>
      </div>

      {existing && existing.units > 0 && (
        <div className={styles.note}>
          Library currently holds {existing.units} cards and {existing.known} known items. Saving replaces
          the imported ones.
        </div>
      )}

      <div className={styles.panel}>
        <p className={styles.hint}>
          In Anki: <b>File → Export → Notes in Plain Text</b> (with HTML kept). Choose that .txt here.
        </p>
        <input
          type="file"
          accept=".txt,.tsv,text/plain"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {indexError && <div className={styles.error}>{indexError}</div>}
      </div>

      {deck && summary && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>{fileName}</div>
          <div className={styles.chips}>
            <span className={styles.chip}>{summary.total} notes</span>
            <span className={styles.chip}>{summary.byFormat.old} old format</span>
            <span className={styles.chip}>{summary.byFormat.intermediate} with Jyutping</span>
            <span className={styles.chip}>{summary.byFormat.current} current format</span>
            {plan && <span className={styles.chip}>{plan.units.length} cards after splits</span>}
            {plan && <span className={styles.chip}>{plan.known.length} known items</span>}
          </div>
        </div>
      )}

      {plan && proposals.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>Needs your call ({proposals.length})</div>
          <p className={styles.hint}>
            The official HSK 3.0 list can&apos;t decide these. Defaults are only suggestions.
          </p>
          {proposals.map(({ note, split, action }) => (
            <div key={note.row} className={styles.row}>
              <div className={styles.front}>{note.front}</div>
              <div className={styles.reason}>{split.reason}</div>
              <div className={styles.toggle}>
                {(["keep", "split"] as const).map((c) => (
                  <button
                    key={c}
                    className={action === c ? styles.on : undefined}
                    onClick={() => setSplit(note.row, c)}
                  >
                    {c === "keep" ? "Keep together" : "Split"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {plan && official.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>Decided by the official list ({official.length})</div>
          {official.map(({ note, split }) => (
            <div key={note.row} className={styles.row}>
              <div className={styles.front}>{note.front}</div>
              <div className={styles.reason}>
                {split.action === "keep" ? "keep together" : "split"} — {split.reason}
              </div>
            </div>
          ))}
        </div>
      )}

      {plan && grammar.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>Looks like grammar ({grammar.length})</div>
          <p className={styles.hint}>These become grammar cards. Switch any that are really vocabulary.</p>
          {grammar.map(({ note }) => {
            const current = typeChoices.get(note.row) ?? "grammar";
            return (
              <div key={note.row} className={styles.row}>
                <div className={styles.front}>{note.front}</div>
                <div className={styles.toggle}>
                  {(["grammar", "word"] as const).map((t) => (
                    <button
                      key={t}
                      className={current === t ? styles.on : undefined}
                      onClick={() => setType(note.row, t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {plan && (
        <div className={styles.panel}>
          <button className={styles.primary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : `Save ${plan.units.length} cards to library`}
          </button>
          {saved && (
            <div className={styles.ok}>
              Saved. Library now holds {saved.units} cards and {saved.known} known items.{" "}
              <Link href="/rewrite">Continue to rewrite →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

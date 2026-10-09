"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./import.module.css";
import { notesFromApkg, parseAnkiExport, summarize, type ParsedDeck } from "@/lib/anki-import";
import { getAccessCode } from "@/lib/access-code";
import { buildDeckPlan, type CardType } from "@/lib/deck-plan";
import type { Hsk30Index } from "@/lib/split-front";
import { db, type DeckUnitRecord } from "@/lib/db";
import { mergeDeck } from "@/lib/merge-deck";
import { BackupPanel } from "../backup-panel";

type Choice = "keep" | "split";

export default function ImportPage() {
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  const [fileName, setFileName] = useState("");
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState<Hsk30Index | null>(null);
  const [indexError, setIndexError] = useState("");
  const [splitChoices, setSplitChoices] = useState<Map<number, Choice>>(new Map());
  const [typeChoices, setTypeChoices] = useState<Map<number, CardType>>(new Map());
  const [saved, setSaved] = useState<{ units: number; known: number } | null>(null);
  const [existing, setExisting] = useState<{ units: number; known: number } | null>(null);
  const [library, setLibrary] = useState<DeckUnitRecord[]>([]);
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
    Promise.all([db.deck_units.toArray(), db.known.count()]).then(([units, known]) => {
      setLibrary(units);
      setExisting({ units: units.length, known });
    });
  }, []);

  const plan = useMemo(
    () => (deck && index ? buildDeckPlan(deck, index, splitChoices, typeChoices) : null),
    [deck, index, splitChoices, typeChoices],
  );
  const summary = useMemo(() => (deck ? summarize(deck) : null), [deck]);
  // With cards already in the library, a new export is merged in rather than replacing them.
  const merge = useMemo(() => (plan && library.length > 0 ? mergeDeck(library, plan.units) : null), [plan, library]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setSaved(null);
    setSplitChoices(new Map());
    setTypeChoices(new Map());
    setFileName(file.name);
    setLoadError("");
    try {
      if (file.name.toLowerCase().endsWith(".apkg")) {
        const code = getAccessCode();
        const res = await fetch("/api/apkg", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", ...(code ? { "x-access-code": code } : {}) },
          body: file,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `could not read the package (${res.status})`);
        setDeck(notesFromApkg(body.notes));
      } else {
        setDeck(parseAnkiExport(await file.text()));
      }
    } catch (e) {
      setDeck(null);
      setLoadError(e instanceof Error ? e.message : "could not read the file");
    }
  };

  const setSplit = (row: number, c: Choice) =>
    setSplitChoices((prev) => new Map(prev).set(row, c));
  const setType = (row: number, t: CardType) =>
    setTypeChoices((prev) => new Map(prev).set(row, t));

  const knownRecords = (now: number) =>
    (plan?.known ?? []).map((k) => ({
      key: `${k.type}:${k.item}`,
      item: k.item,
      type: k.type,
      source: "anki" as const,
      createdAt: now,
    }));

  const refresh = async () => {
    const [units, known] = await Promise.all([db.deck_units.toArray(), db.known.count()]);
    setLibrary(units);
    setSaved({ units: units.length, known });
    setExisting({ units: units.length, known });
  };

  // First import: nothing to preserve.
  const saveFresh = async () => {
    if (!plan) return;
    setSaving(true);
    const now = Date.now();
    await db.transaction("rw", db.deck_units, db.known, async () => {
      await db.deck_units.clear();
      await db.known.where("source").equals("anki").delete();
      await db.deck_units.bulkAdd(plan.units.map((u) => ({ ...u, status: "pending" as const, createdAt: now })));
      await db.known.bulkPut(knownRecords(now));
    });
    await refresh();
    setSaving(false);
  };

  // Later imports: keep rewrites and approvals, add new notes, flag changed ones.
  const saveMerge = async () => {
    if (!plan || !merge) return;
    setSaving(true);
    const now = Date.now();
    await db.transaction("rw", db.deck_units, db.known, async () => {
      await db.deck_units.bulkAdd(merge.add.map((u) => ({ ...u, status: "pending" as const, createdAt: now })));
      for (const { id, changes } of merge.update) await db.deck_units.update(id, changes);
      await db.known.where("source").equals("anki").delete();
      await db.known.bulkPut(knownRecords(now));
    });
    await refresh();
    setSaving(false);
  };

  const replaceAll = async () => {
    const worked = library.filter((u) => u.status !== "pending").length;
    if (worked > 0 && !window.confirm(`Replacing the library discards ${worked} rewritten cards. Continue?`)) return;
    await saveFresh();
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

      <BackupPanel className={styles.panel} />

      <div className={styles.panel}>
        <p className={styles.hint}>
          In Anki: <b>File → Export → Anki Deck Package (.apkg)</b>. A package carries Anki&apos;s own note ids, so
          cards stay matched even if you edit a word later. A plain-text export (<b>Notes in Plain Text</b>, HTML
          kept) also works, but matches by the word itself.
        </p>
        <input
          type="file"
          accept=".apkg,.txt,.tsv,text/plain"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {indexError && <div className={styles.error}>{indexError}</div>}
        {loadError && <div className={styles.error}>{loadError}</div>}
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

      {plan && merge && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>Merge into library</div>
          <div className={styles.chips}>
            <span className={styles.chip}>{merge.addedFronts.length} new</span>
            <span className={styles.chip}>{merge.unchanged} unchanged</span>
            <span className={styles.chip}>{merge.changedFronts.length} changed in Anki</span>
            <span className={styles.chip}>{merge.staleFronts.length} rewrites out of date</span>
            <span className={styles.chip}>{merge.importedFronts.length} of your rewrites found in Anki</span>
            <span className={styles.chip}>{merge.missingFronts.length} no longer in Anki</span>
          </div>
          {merge.addedFronts.length > 0 && <p className={styles.hint}>New: {merge.addedFronts.slice(0, 20).join(", ")}</p>}
          {merge.staleFronts.length > 0 && (
            <p className={styles.hint}>
              Rewritten before the source changed (flagged, not overwritten): {merge.staleFronts.join(", ")}
            </p>
          )}
          {merge.missingFronts.length > 0 && (
            <p className={styles.hint}>No longer in the export (kept, marked missing): {merge.missingFronts.slice(0, 20).join(", ")}</p>
          )}
          <div className={styles.toggle}>
            <button className={styles.on} onClick={saveMerge} disabled={saving}>
              {saving ? "Merging…" : "Merge into library"}
            </button>
            <button onClick={replaceAll} disabled={saving}>
              Replace everything
            </button>
          </div>
          {saved && (
            <div className={styles.ok}>
              Done. Library now holds {saved.units} cards and {saved.known} known items.{" "}
              <Link href="/rewrite">Continue to rewrite →</Link>
            </div>
          )}
        </div>
      )}

      {plan && !merge && (
        <div className={styles.panel}>
          <button className={styles.primary} onClick={saveFresh} disabled={saving}>
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

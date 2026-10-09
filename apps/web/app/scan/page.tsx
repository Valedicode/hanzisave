"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./scan.module.css";
import { db, type NewCardRecord } from "@/lib/db";
import { getAccessCode } from "@/lib/access-code";
import { CardRequestError, requestCard } from "@/lib/card-client";
import { resizeImage } from "@/lib/image-resize";
import { loadKnownWords, markKnown } from "@/lib/known-db";
import { buildAnkiTsv } from "@/lib/rewrite";
import { scanText, type NewWord, type ScanResult } from "@/lib/scan";

const FLOOR_KEY = "hanzisave.levelFloor";
const CONCURRENCY = 3;

const LEVEL_COLOR: Record<number, string> = {
  1: "var(--h1)",
  2: "var(--h2)",
  3: "var(--h3)",
  4: "var(--h4)",
  5: "var(--h5)",
  6: "var(--h6)",
};

export default function ScanPage() {
  const [text, setText] = useState("");
  const [levelFloor, setLevelFloor] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<NewCardRecord[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [generating, setGenerating] = useState(0);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    db.new_cards
      .where("status")
      .notEqual("discarded")
      .toArray()
      .then((all) => {
        setCards(all);
        try {
          setLevelFloor(Number(localStorage.getItem(FLOOR_KEY) ?? 0) || 0);
        } catch {
          // not remembered
        }
      });
  }, []);

  const changeFloor = (value: number) => {
    setLevelFloor(value);
    try {
      localStorage.setItem(FLOOR_KEY, String(value));
    } catch {
      // not remembered
    }
  };

  const patchCard = async (id: number, changes: Partial<NewCardRecord>) => {
    await db.new_cards.update(id, changes);
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  };

  const readImage = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setOcrBusy(true);
    try {
      const blob = await resizeImage(file);
      const code = getAccessCode();
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", ...(code ? { "x-access-code": code } : {}) },
        body: blob,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `could not read the image (${res.status})`);
      if (!body.text) throw new Error("No Chinese text found in that image.");
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${body.text}` : body.text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not read the image");
    } finally {
      setOcrBusy(false);
    }
  };

  const find = async () => {
    setError("");
    setMessage("");
    const known = await loadKnownWords();
    setResult(scanText(text, { known, levelFloor }));
    setSelected(new Set());
  };

  const removeFromResult = (surfaces: string[]) => {
    const gone = new Set(surfaces);
    setResult((r) => (r ? { ...r, newWords: r.newWords.filter((w) => !gone.has(w.surface)) } : r));
    setSelected((prev) => new Set([...prev].filter((s) => !gone.has(s))));
  };

  const iKnow = async (surfaces: string[]) => {
    await markKnown(surfaces);
    removeFromResult(surfaces);
  };

  const generate = async (card: NewCardRecord) => {
    try {
      const back = await requestCard(
        { item: card.front, type: "word", context: card.context.slice(0, 400) },
        getAccessCode() || undefined,
      );
      await patchCard(card.id!, { status: "generated", back, problems: undefined });
    } catch (e) {
      const err = e instanceof CardRequestError ? e : new CardRequestError(String(e), 0);
      await patchCard(card.id!, { status: "failed", problems: err.problems ?? [err.message] });
      if (err.fatal) setError(err.message);
    }
  };

  const makeCards = async (words: NewWord[]) => {
    if (words.length === 0) return;
    setError("");
    const now = Date.now();
    const records: NewCardRecord[] = words.map((w) => ({
      front: w.surface,
      level: w.level,
      context: w.sentence,
      status: "queued",
      createdAt: now,
    }));
    const ids = await db.new_cards.bulkAdd(records, { allKeys: true });
    const created = records.map((r, i) => ({ ...r, id: ids[i] as number }));
    setCards((prev) => [...created, ...prev]);
    removeFromResult(words.map((w) => w.surface));

    setGenerating((n) => n + created.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, created.length) }, async () => {
        while (next < created.length) {
          await generate(created[next++]);
          setGenerating((n) => n - 1);
        }
      }),
    );
  };

  const approve = async (card: NewCardRecord) => {
    await markKnown([card.front]);
    await patchCard(card.id!, { status: "approved" });
  };

  const discard = async (card: NewCardRecord) => {
    await patchCard(card.id!, { status: "discarded" });
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${what}.`);
    } catch {
      setMessage("Could not copy; select the text and copy it by hand.");
    }
  };

  const exportable = cards.filter((c) => c.status === "approved" && !c.exportedAt && c.back);

  const exportCards = async () => {
    const out = buildAnkiTsv(exportable.map((c) => ({ front: c.front, back: c.back!, type: "word" as const, tags: "" })));
    const url = URL.createObjectURL(new Blob([out.tsv], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hanzisave-new-cards.txt";
    a.click();
    URL.revokeObjectURL(url);
    const now = Date.now();
    await Promise.all(exportable.map((c) => patchCard(c.id!, { exportedAt: now })));
    setMessage(`Exported ${out.count} cards. Import the file into Anki (note type Einfach, deck Chinese Level 2).`);
  };

  const selectedWords = useMemo(
    () => (result?.newWords ?? []).filter((w) => selected.has(w.surface)),
    [result, selected],
  );
  const allSelected = !!result && result.newWords.length > 0 && selectedWords.length === result.newWords.length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Back
        </Link>
        <div className={styles.title}>Scan new words</div>
      </div>

      <div className={styles.panel}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste Chinese text here, or photograph a page…"
        />
        <div className={styles.row}>
          <label className={styles.secondary}>
            {ocrBusy ? "Reading image…" : "Take or choose a photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={ocrBusy}
              onChange={(e) => {
                readImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className={styles.inline}>
            Hide HSK words up to level
            <select value={levelFloor} onChange={(e) => changeFloor(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "none" : n}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.primary} onClick={find} disabled={!text.trim() || ocrBusy}>
            Find new words
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>

      {result && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            {result.newWords.length} new {result.newWords.length === 1 ? "word" : "words"}
            <span className={styles.hint}>
              {" "}
              · {result.knownWords} of {result.totalWords} words in the text are already known
            </span>
          </div>

          {result.newWords.length > 0 && (
            <div className={styles.row}>
              <label className={styles.inline}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(result.newWords.map((w) => w.surface)))}
                />
                Select all
              </label>
              <button className={styles.primary} disabled={selectedWords.length === 0} onClick={() => makeCards(selectedWords)}>
                Make cards ({selectedWords.length})
              </button>
              <button className={styles.secondary} disabled={selectedWords.length === 0} onClick={() => iKnow(selectedWords.map((w) => w.surface))}>
                I know these ({selectedWords.length})
              </button>
            </div>
          )}

          {result.newWords.map((w) => (
            <div key={w.surface} className={styles.word}>
              <input
                type="checkbox"
                aria-label={`Select ${w.surface}`}
                checked={selected.has(w.surface)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(w.surface)) next.add(w.surface);
                    return next;
                  })
                }
              />
              <span className={styles.hanzi}>{w.surface}</span>
              <span className={styles.level} style={{ background: w.level ? LEVEL_COLOR[w.level] : "var(--oov)" }}>
                {w.level ? `HSK ${w.level}` : "not in HSK"}
              </span>
              {w.count > 1 && <span className={styles.hint}>×{w.count}</span>}
              <span className={styles.context}>{w.sentence}</span>
              <button className={styles.secondary} onClick={() => makeCards([w])}>
                Make card
              </button>
              <button className={styles.secondary} onClick={() => iKnow([w.surface])}>
                I know it
              </button>
            </div>
          ))}
          {result.newWords.length === 0 && <div className={styles.hint}>Nothing new in this text.</div>}
        </div>
      )}

      {(cards.length > 0 || generating > 0) && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            Your new cards{generating > 0 && <span className={styles.hint}> · generating {generating}…</span>}
          </div>
          <div className={styles.row}>
            <button className={styles.primary} disabled={exportable.length === 0} onClick={exportCards}>
              Download {exportable.length} approved for Anki
            </button>
          </div>
          {message && <div className={styles.hint}>{message}</div>}

          {cards.map((c) => {
            const draft = editing && editing.id === c.id ? editing : null;
            return (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.hanzi}>{c.front}</span>
                <span className={styles.badge}>{c.status}</span>
                {c.exportedAt && <span className={styles.badge}>downloaded</span>}
              </div>
              {c.back ? (
                draft ? (
                  <textarea
                    className={styles.textarea}
                    value={draft.text}
                    onChange={(e) => setEditing({ id: c.id!, text: e.target.value })}
                  />
                ) : (
                  <pre className={styles.pre}>{c.back}</pre>
                )
              ) : (
                <div className={styles.hint}>
                  {c.status === "failed" ? (c.problems ?? []).join("; ") : "Waiting for the card…"}
                </div>
              )}
              <div className={styles.row}>
                {draft ? (
                  <>
                    <button
                      className={styles.primary}
                      onClick={async () => {
                        await patchCard(c.id!, { back: draft.text.trim() });
                        setEditing(null);
                      }}
                    >
                      Save
                    </button>
                    <button className={styles.secondary} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {c.status === "generated" && (
                      <button className={styles.primary} onClick={() => approve(c)}>
                        Approve
                      </button>
                    )}
                    {c.back && (
                      <button className={styles.secondary} onClick={() => setEditing({ id: c.id!, text: c.back! })}>
                        Edit
                      </button>
                    )}
                    {c.back && (
                      <>
                        <button className={styles.secondary} onClick={() => copy(c.front, "the front")}>
                          Copy front
                        </button>
                        <button className={styles.secondary} onClick={() => copy(c.back!, "the back")}>
                          Copy back
                        </button>
                      </>
                    )}
                    {(c.status === "failed" || c.status === "generated") && (
                      <button className={styles.secondary} onClick={() => generate(c)}>
                        {c.back ? "Regenerate" : "Retry"}
                      </button>
                    )}
                    <button className={styles.secondary} onClick={() => discard(c)}>
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

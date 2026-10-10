"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./scan.module.css";
import { db, type NewCardRecord } from "@/lib/db";
import { getAccessCode } from "@/lib/access-code";
import { AccessNotice } from "../access-notice";
import { Spinner } from "../spinner";
import { WordPreview, type PreviewTarget } from "./word-preview";
import { CardRequestError, requestCard } from "@/lib/card-client";
import { resizeImage } from "@/lib/image-resize";
import { CardPrefetcher, type PrefetchProgress } from "@/lib/card-prefetch";
import { levelLabel } from "@/lib/lexicon";
import { loadKnownGrammar, loadKnownWords, markGrammarKnown, markKnown } from "@/lib/known-db";
import { buildAnkiTsv } from "@/lib/rewrite";
import { findGrammar, GrammarRequestError } from "@/lib/grammar-client";
import { grammarFront, grammarRequest } from "@/lib/grammar-cards";
import { detectGrammar, modelHits, structureCandidates, type GrammarHit } from "@/lib/grammar-detect";
import { markText, scanText, type MarkedSentence, type NewWord, type ScanResult } from "@/lib/scan";

const FLOOR_KEY = "hanzisave.levelFloor";
const CONCURRENCY = 3;
// A card made ahead of time is reused for a week; the card spec may change after that.
const CACHE_DAYS = 7;

const LEVEL_COLOR: Record<number, string> = {
  1: "var(--h1)",
  2: "var(--h2)",
  3: "var(--h3)",
  4: "var(--h4)",
  5: "var(--h5)",
  6: "var(--h6)",
  7: "var(--h7)",
};

// A sentence with the words that show a grammar point in bold; plain when there is nothing to mark.
function Marked({ sentence, span }: { sentence: string; span?: string }) {
  const at = span ? sentence.indexOf(span) : -1;
  if (!span || at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <b>{span}</b>
      {sentence.slice(at + span.length)}
    </>
  );
}

export default function ScanPage() {
  const [prefetch, setPrefetch] = useState<PrefetchProgress>({ ready: 0, total: 0 });
  const [prefetcher] = useState(
    () =>
      new CardPrefetcher({
        generate: (word, sentence) =>
          requestCard({ item: word, type: "word", context: sentence }, getAccessCode() || undefined),
        cache: {
          get: async (key) => {
            const hit = await db.card_cache.get(key);
            return hit && Date.now() - hit.createdAt < CACHE_DAYS * 86_400_000 ? hit.back : undefined;
          },
          put: async (key, back) => {
            await db.card_cache.put({ key, back, createdAt: Date.now() });
          },
        },
        concurrency: CONCURRENCY,
        isFatal: (e) => e instanceof CardRequestError && e.fatal,
        onProgress: (p) => setPrefetch(p),
      }),
  );
  const [text, setText] = useState("");
  // HSK 1-2 words are hidden by default; the deck's basics aren't all in Anki, and they are noise.
  const [levelFloor, setLevelFloor] = useState(2);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [marked, setMarked] = useState<MarkedSentence[] | null>(null);
  const [grammar, setGrammar] = useState<GrammarHit[]>([]);
  // The model check for sentence structures runs after the rules; a newer scan makes an older answer stale.
  const [structures, setStructures] = useState<"idle" | "checking" | "failed">("idle");
  const scanRun = useRef(0);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedGrammar, setSelectedGrammar] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<NewCardRecord[]>([]);
  // Which button started the read, so only that one shows the spinner.
  const [ocrSource, setOcrSource] = useState<"camera" | "upload" | null>(null);
  const ocrBusy = ocrSource !== null;
  const [generating, setGenerating] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [message, setMessage] = useState("");

  // Leaving the page stops the background work that has not started.
  useEffect(() => () => prefetcher.cancel(), [prefetcher]);

  useEffect(() => {
    db.new_cards
      .where("status")
      .notEqual("discarded")
      .toArray()
      .then((all) => {
        setCards(all);
        try {
          const stored = localStorage.getItem(FLOOR_KEY);
          if (stored !== null) setLevelFloor(Number(stored) || 0);
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

  const readImage = async (file: File | undefined, source: "camera" | "upload") => {
    if (!file) return;
    setError("");
    setNeedsCode(false);
    setOcrSource(source);
    try {
      const blob = await resizeImage(file);
      const code = getAccessCode();
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", ...(code ? { "x-access-code": code } : {}) },
        body: blob,
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNeedsCode(true);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `could not read the image (${res.status})`);
      if (!body.text) throw new Error("No Chinese text found in that image.");
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${body.text}` : body.text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not read the image");
    } finally {
      setOcrSource(null);
    }
  };

  const find = async () => {
    setError("");
    setMessage("");
    const [known, knownGrammar] = await Promise.all([loadKnownWords(), loadKnownGrammar()]);
    const scanned = scanText(text, { known, levelFloor });
    setResult(scanned);
    prefetcher.start(scanned.newWords.map((w) => ({ word: w.surface, sentence: w.sentence.slice(0, 400) })));
    setMarked(markText(text, { known, levelFloor }));
    setGrammar(detectGrammar(text, { known: knownGrammar, levelFloor }));
    void checkStructures(knownGrammar);
    setPreview(null);
    setSelected(new Set());
    setSelectedGrammar(new Set());
  };

  // Points rules cannot find (把, 被, 比, complements) are asked of the model, which may only name catalog ids.
  const checkStructures = async (knownGrammar: ReadonlySet<string>) => {
    const run = ++scanRun.current;
    const ids = structureCandidates({ known: knownGrammar, levelFloor }).map((p) => p.id);
    if (ids.length === 0) {
      setStructures("idle");
      return;
    }
    setStructures("checking");
    try {
      const findings = await findGrammar(text, ids, getAccessCode() || undefined);
      if (run !== scanRun.current) return;
      setGrammar((prev) => [...prev, ...modelHits(findings).filter((hit) => !prev.some((p) => p.point.id === hit.point.id))]);
      setStructures("idle");
    } catch (e) {
      if (run !== scanRun.current) return;
      if (e instanceof GrammarRequestError && e.status === 401) setNeedsCode(true);
      setStructures("failed");
    }
  };

  const grammarKnown = async (ids: string[]) => {
    await markGrammarKnown(ids);
    setGrammar((prev) => prev.filter((hit) => !ids.includes(hit.point.id)));
    setSelectedGrammar((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
  };

  const removeFromResult = (surfaces: string[]) => {
    const gone = new Set(surfaces);
    setResult((r) => (r ? { ...r, newWords: r.newWords.filter((w) => !gone.has(w.surface)) } : r));
    setSelected((prev) => new Set([...prev].filter((s) => !gone.has(s))));
    setMarked((m) =>
      m &&
      m.map((sentence) => ({
        ...sentence,
        words: sentence.words.map((w) => (w.status === "new" && gone.has(w.surface) ? { ...w, status: "known" as const } : w)),
      })),
    );
  };

  const iKnow = async (surfaces: string[]) => {
    prefetcher.drop(surfaces);
    await markKnown(surfaces);
    removeFromResult(surfaces);
  };

  const setBusy = (id: number, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // `fresh` skips the cache: Retry and Regenerate want a new card, not the one made ahead of time.
  const generate = async (card: NewCardRecord, fresh = false) => {
    setBusy(card.id!, true);
    try {
      const sentence = card.context.slice(0, 400);
      let back: string;
      if (card.type === "grammar") {
        // Grammar cards are made on request, not ahead of time, so there is nothing to reuse.
        const req = card.pointId ? grammarRequest(card.pointId, card.front, card.context) : null;
        if (!req) throw new CardRequestError("unknown grammar point", 0);
        back = await requestCard(req, getAccessCode() || undefined);
      } else {
        back = fresh ? await prefetcher.fresh(card.front, sentence) : await prefetcher.request(card.front, sentence);
      }
      await patchCard(card.id!, { status: "generated", back, problems: undefined });
    } catch (e) {
      const err = e instanceof CardRequestError ? e : new CardRequestError(String(e), 0);
      await patchCard(card.id!, { status: "failed", problems: err.problems ?? [err.message] });
      if (err.status === 401) setNeedsCode(true);
      else if (err.fatal) setError(err.message);
    } finally {
      setBusy(card.id!, false);
    }
  };

  const makeCards = async (words: NewWord[]) => {
    if (words.length === 0) return;
    setError("");
    const now = Date.now();
    const records: NewCardRecord[] = words.map((w) => ({
      type: "word" as const,
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

  const makeGrammarCards = async (hits: GrammarHit[]) => {
    if (hits.length === 0) return;
    setError("");
    const records: NewCardRecord[] = hits.map((hit) => ({
      type: "grammar" as const,
      pointId: hit.point.id,
      front: grammarFront(hit.point, hit.frame),
      level: hit.point.level,
      context: hit.sentence,
      matched: hit.matched || undefined,
      status: "queued",
      createdAt: Date.now(),
    }));
    const ids = await db.new_cards.bulkAdd(records, { allKeys: true });
    const created = records.map((r, i) => ({ ...r, id: ids[i] as number }));
    setCards((prev) => [...created, ...prev]);
    setGrammar((prev) => prev.filter((hit) => !hits.some((h) => h.point.id === hit.point.id)));
    setSelectedGrammar((prev) => new Set([...prev].filter((id) => !hits.some((h) => h.point.id === id))));

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
    if (card.type === "grammar" && card.pointId) await markGrammarKnown([card.pointId]);
    else await markKnown([card.front]);
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
    const out = buildAnkiTsv(exportable.map((c) => ({ front: c.front, back: c.back!, type: c.type ?? ("word" as const), tags: "" })));
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
  const pickedGrammar = useMemo(() => grammar.filter((hit) => selectedGrammar.has(hit.point.id)), [grammar, selectedGrammar]);
  const allGrammarSelected = grammar.length > 0 && pickedGrammar.length === grammar.length;
  const allSelected = !!result && result.newWords.length > 0 && selectedWords.length === result.newWords.length;

  const wordCards = cards.filter((c) => (c.type ?? "word") === "word");
  const grammarCards = cards.filter((c) => c.type === "grammar");

  const renderCard = (c: NewCardRecord) => {
            const draft = editing && editing.id === c.id ? editing : null;
            return (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.hanzi}>{c.front}</span>
                <span className={styles.badge}>{c.status}</span>
                {c.exportedAt && <span className={styles.badge}>downloaded</span>}
              </div>
              {c.type === "grammar" && (
                <div className={styles.context}>
                  <Marked sentence={c.context} span={c.matched} />
                </div>
              )}
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
                  {c.status === "failed" && !busyIds.has(c.id!) ? (
                    (c.problems ?? []).join("; ")
                  ) : (
                    <>
                      <Spinner />
                      {busyIds.has(c.id!) ? "Generating the card…" : "Waiting for the card…"}
                    </>
                  )}
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
                      <button className={styles.secondary} onClick={() => generate(c, true)} disabled={busyIds.has(c.id!)}>
                        {busyIds.has(c.id!) && <Spinner />}
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
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
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
            {ocrSource === "camera" ? (
              <>
                <Spinner />
                Reading image…
              </>
            ) : (
              "Take a photo"
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={ocrBusy}
              onChange={(e) => {
                readImage(e.target.files?.[0], "camera");
                e.target.value = "";
              }}
            />
          </label>
          <label className={styles.secondary}>
            {ocrSource === "upload" ? (
              <>
                <Spinner />
                Reading image…
              </>
            ) : (
              "Upload an image"
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={ocrBusy}
              onChange={(e) => {
                readImage(e.target.files?.[0], "upload");
                e.target.value = "";
              }}
            />
          </label>
          <label className={styles.inline}>
            Hide HSK words up to level
            <select value={levelFloor} onChange={(e) => changeFloor(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "none" : n === 7 ? "7–9" : n}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.primary} onClick={find} disabled={!text.trim() || ocrBusy}>
            Analyze text
          </button>
        </div>
        {needsCode && <AccessNotice />}
        {error && <div className={styles.error}>{error}</div>}
      </div>

      {result && marked && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            {result.newWords.length} new {result.newWords.length === 1 ? "word" : "words"}
            <span className={styles.hint}>
              {" "}
              · {result.knownWords} of {result.totalWords} words in the text are already known
            </span>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.dot} ${styles.dotNew}`} />
              New word, tap for a preview
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.dot} ${styles.dotKnown}`} />
              Known
            </span>
          </div>
          {prefetch.total > 0 && (
            <div className={styles.hint}>
              {prefetch.ready < prefetch.total ? (
                <>
                  <Spinner />
                  Preparing cards in the background · {prefetch.ready} of {prefetch.total} ready
                </>
              ) : (
                `${prefetch.total} cards are ready, so Make card is instant.`
              )}
            </div>
          )}
          {marked.map((sentence, i) => (
            <p key={i} className={styles.reading}>
              {sentence.words.map((w, j) =>
                w.status === "new" ? (
                  <button
                    key={j}
                    type="button"
                    className={`${styles.rw} ${styles.rwNew} ${preview?.word === w.surface && preview.sentence === sentence.text ? styles.rwSelected : ""}`}
                    onClick={() => setPreview({ word: w.surface, level: w.level, sentence: sentence.text })}
                  >
                    {w.surface}
                  </button>
                ) : (
                  <span key={j} className={w.status === "known" ? styles.rwKnown : undefined}>
                    {w.surface}
                  </span>
                ),
              )}
            </p>
          ))}
        </div>
      )}

      {result && (
        <div className={styles.panel}>
          <details className={styles.details}>
            <summary className={styles.summary}>New words ({result.newWords.length})</summary>
            <div className={styles.detailsBody}>
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
                    {w.level ? levelLabel(w.level) : "not in HSK"}
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
          </details>

          <details className={styles.details}>
            <summary className={styles.summary}>New grammar ({grammar.length})</summary>
            <div className={styles.detailsBody}>
              {grammar.length > 0 && (
                <div className={styles.row}>
                  <label className={styles.inline}>
                    <input
                      type="checkbox"
                      checked={allGrammarSelected}
                      onChange={() => setSelectedGrammar(allGrammarSelected ? new Set() : new Set(grammar.map((hit) => hit.point.id)))}
                    />
                    Select all
                  </label>
                  <button className={styles.primary} disabled={pickedGrammar.length === 0} onClick={() => makeGrammarCards(pickedGrammar)}>
                    Make cards ({pickedGrammar.length})
                  </button>
                  <button className={styles.secondary} disabled={pickedGrammar.length === 0} onClick={() => grammarKnown(pickedGrammar.map((hit) => hit.point.id))}>
                    I know these ({pickedGrammar.length})
                  </button>
                </div>
              )}
              {grammar.map((hit) => {
                return (
                  <div key={hit.point.id} className={styles.word}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${hit.point.name}`}
                      checked={selectedGrammar.has(hit.point.id)}
                      onChange={() =>
                        setSelectedGrammar((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(hit.point.id)) next.add(hit.point.id);
                          return next;
                        })
                      }
                    />
                    <span className={styles.pattern}>{hit.point.name}</span>
                    {hit.point.en && <span className={styles.hint}>{hit.point.en}</span>}
                    <span className={styles.level} style={{ background: LEVEL_COLOR[hit.point.level] }}>
                      {levelLabel(hit.point.level)}
                    </span>
                    {hit.count > 1 && <span className={styles.hint}>×{hit.count}</span>}
                    {hit.point.brief && <span className={styles.brief}>{hit.point.brief}</span>}
                    <span className={styles.context}>
                      <Marked sentence={hit.sentence} span={hit.matched} />
                    </span>
                    <button className={styles.secondary} onClick={() => makeGrammarCards([hit])}>
                      Make card
                    </button>
                    <button className={styles.secondary} onClick={() => grammarKnown([hit.point.id])}>
                      I know it
                    </button>
                  </div>
                );
              })}
              {structures === "checking" && (
                <div className={styles.hint}>
                  <Spinner /> Checking sentence structures (把, 被, 比, complements)…
                </div>
              )}
              {grammar.length === 0 && structures !== "checking" && <div className={styles.hint}>No new grammar found in this text.</div>}
              {structures === "failed" && (
                <div className={styles.hint}>The sentence-structure check did not run, so only fixed patterns are listed.</div>
              )}
              <div className={styles.hint}>Fixed patterns such as 又……又…… are found by rules; sentence structures are suggested by the model, so check them against the sentence.</div>
            </div>
          </details>
        </div>
      )}

      {preview && (
        <WordPreview
          key={`${preview.word}|${preview.sentence}`}
          target={preview}
          onMakeCard={() => {
            const word = result?.newWords.find((w) => w.surface === preview.word);
            setPreview(null);
            if (word) makeCards([word]);
          }}
          onKnow={() => {
            const surface = preview.word;
            setPreview(null);
            iKnow([surface]);
          }}
          onClose={() => setPreview(null)}
        />
      )}

      {(cards.length > 0 || generating > 0) && (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            Your new cards
            {generating > 0 && (
              <span className={styles.hint}>
                {" "}
                · <Spinner />
                generating {generating}…
              </span>
            )}
          </div>
          <div className={styles.row}>
            <button className={styles.primary} disabled={exportable.length === 0} onClick={exportCards}>
              Download {exportable.length} approved for Anki
            </button>
          </div>
          {message && <div className={styles.hint}>{message}</div>}

          <div className={styles.listTitle}>Word cards ({wordCards.length})</div>
          {wordCards.length === 0 && <div className={styles.hint}>No word cards yet.</div>}
          {wordCards.map(renderCard)}

          <div className={styles.listTitle}>Grammar cards ({grammarCards.length})</div>
          {grammarCards.length === 0 && <div className={styles.hint}>No grammar cards yet.</div>}
          {grammarCards.map(renderCard)}
        </div>
      )}
    </div>
  );
}

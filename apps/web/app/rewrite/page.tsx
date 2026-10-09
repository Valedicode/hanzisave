"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./rewrite.module.css";
import { db, type DeckUnitRecord } from "@/lib/db";
import { CardRequestError, requestCard } from "@/lib/card-client";
import { getAccessCode, setAccessCode as storeAccessCode } from "@/lib/access-code";
import { checkCardFormat } from "@/lib/card-format";
import { planComponentCards } from "@/lib/components";
import { etaTracker, formatEta } from "@/lib/eta";
import { lookup } from "@/lib/lexicon";
import { loadKnownWords } from "@/lib/known-db";
import type { Hsk30Index } from "@/lib/split-front";
import { buildAnkiTsv, splitChanged } from "@/lib/rewrite";

type Status = DeckUnitRecord["status"];
type Filter = Status | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "generated", label: "To review" },
  { key: "in_format", label: "Already in format" },
  { key: "approved", label: "Approved" },
  { key: "confirmed", label: "Confirmed" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 15;
const BATCH = 25;
const CONCURRENCY = 3;
// Rough cost of one card with the default model; only used for the confirmation prompt.
const COST_PER_CARD = 0.0013;
// The one-time component backfill is offered until it has been run or skipped.
const BACKFILL_KEY = "hanzisave.componentBackfill.v1";

// A Back that already has every label of the card spec needs no regeneration.
const alreadyInFormat = (u: DeckUnitRecord) => checkCardFormat(u.oldBack, u.type).ok;

// Cards that have a rewrite waiting for approval.
const approvable = (u: DeckUnitRecord) => !!u.newBack && u.status !== "approved";
// Bulk actions skip cards whose source changed in Anki after they were rewritten.
const bulkApprovable = (u: DeckUnitRecord) => approvable(u) && !u.stale;

export default function RewritePage() {
  const [units, setUnits] = useState<DeckUnitRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [running, setRunning] = useState<{ done: number; total: number; etaMs: number | null } | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [exported, setExported] = useState("");
  const [notice, setNotice] = useState("");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const stop = useRef(false);

  useEffect(() => {
    db.deck_units.toArray().then((all) => {
      setUnits(all);
      setAccessCode(getAccessCode());
      try {
        setBackfillOpen(localStorage.getItem(BACKFILL_KEY) === null);
      } catch {
        // storage unavailable: the step is simply not offered
      }
      setLoaded(true);
    });
  }, []);

  const patch = async (id: number, changes: Partial<DeckUnitRecord>) => {
    await db.deck_units.update(id, changes);
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      pending: 0,
      generated: 0,
      approved: 0,
      failed: 0,
      skipped: 0,
      in_format: 0,
      confirmed: 0,
      all: units.length,
    };
    for (const u of units) c[u.status]++;
    return c;
  }, [units]);

  const duplicateFronts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const u of units) seen.set(u.front, (seen.get(u.front) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([f]) => f));
  }, [units]);

  // A search looks through every card, whatever tab is open.
  const needle = query.trim();
  const shown = useMemo(
    () =>
      needle
        ? units.filter((u) => u.front.includes(needle) || u.forms.some((f) => f.includes(needle)) || u.oldBack.includes(needle))
        : units.filter((u) => filter === "all" || u.status === filter),
    [units, filter, needle],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleIds = visible.map((u) => u.id!);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const approvableAll = units.filter(bulkApprovable).map((u) => u.id!);
  // Any card can be selected; each action then applies to the selected cards it makes sense for.
  const selectedCards = units.filter((u) => selected.has(u.id!));
  const selectedToApprove = selectedCards.filter(bulkApprovable).map((u) => u.id!);
  const selectedToGenerate = selectedCards.filter((u) => u.status !== "approved");
  const selectedOverwrites = selectedToGenerate.filter((u) => u.newBack).length;
  const toConfirmAll = units.filter((u) => u.status === "in_format").map((u) => u.id!);
  const selectedToConfirm = selectedCards.filter((u) => u.status === "in_format").map((u) => u.id!);

  const generateOne = async (u: DeckUnitRecord) => {
    try {
      const raw = await requestCard(
        {
          item: u.front,
          type: u.type,
          oldBack: u.oldBack || undefined,
          context: u.componentOf ? `part of the phrase ${u.componentOf}` : undefined,
        },
        accessCode || undefined,
      );
      const { back, changed } = splitChanged(raw);
      await patch(u.id!, { status: "generated", newBack: back, changed, problems: undefined, stale: false });
    } catch (e) {
      const err = e instanceof CardRequestError ? e : new CardRequestError(String(e), 0);
      await patch(u.id!, { status: "failed", problems: err.problems ?? [err.message] });
      if (err.fatal) {
        stop.current = true;
        setError(err.message);
      }
    }
  };

  // Free step before any generation: cards whose existing Back already follows the spec are
  // not regenerated. They move to "Already in format" so a human can check the call.
  const sortOutFormatted = async (queue: DeckUnitRecord[]) => {
    const formatted = queue.filter(alreadyInFormat);
    await Promise.all(formatted.map((u) => patch(u.id!, { status: "in_format" })));
    const skip = new Set(formatted.map((u) => u.id));
    setNotice(
      formatted.length > 0
        ? `${formatted.length} cards already follow the new format and were not regenerated. Check them under "Already in format".`
        : "",
    );
    return queue.filter((u) => !skip.has(u.id));
  };

  // Fixed expressions (注册银行卡) get a card for each part (注册, 银行卡). A part is only
  // added if it isn't already a card, in the deck, known, or queued from a scan.
  const addComponentCards = async (cards: DeckUnitRecord[]) => {
    const phrases = cards.filter((c) => c.type === "word").map((c) => c.front);
    if (phrases.length === 0) return;
    const existing = new Set(await loadKnownWords());
    for (const u of await db.deck_units.toArray()) {
      existing.add(u.front);
      for (const f of u.forms) existing.add(f);
    }
    // A part must be a real word: in the HSK lists or already in the learner's own deck.
    const hsk30: Hsk30Index | null = await fetch("/hsk30-index.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const isWord = (w: string) => lookup(w) !== undefined || hsk30?.forms[w] !== undefined;
    const plan = planComponentCards(phrases, existing, isWord);
    if (plan.add.length > 0) {
      const now = Date.now();
      const records: DeckUnitRecord[] = plan.add.map((a) => ({
        front: a.front,
        forms: [a.front],
        type: "word",
        format: "old",
        oldBack: "",
        tags: "",
        sourceRow: 0,
        componentOf: a.componentOf,
        status: "pending",
        createdAt: now,
      }));
      const ids = await db.deck_units.bulkAdd(records, { allKeys: true });
      setUnits((prev) => [...prev, ...records.map((r, i) => ({ ...r, id: ids[i] as number }))]);
    }
    const message =
      plan.add.length > 0
        ? `Added ${plan.add.length} component cards: ${plan.add.map((a) => a.front).join(", ")}. ` +
          `${plan.skipped.length} parts already existed.`
        : "";
    const left =
      plan.unverified.length > 0
        ? ` Left out ${plan.unverified.length} parts that are not in the HSK lists or your deck: ${plan.unverified.join(", ")}.`
        : "";
    if (message || left) setNotice((prev) => (prev ? `${prev} ${message}${left}` : `${message}${left}`.trim()));
  };

  const runQueue = async (queue: DeckUnitRecord[]) => {
    if (queue.length === 0) return;
    stop.current = false;
    setError("");
    const eta = etaTracker(queue.length);
    setRunning({ done: 0, total: queue.length, etaMs: null });
    let next = 0;
    let done = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < queue.length && !stop.current) {
          await generateOne(queue[next++]);
          done++;
          setRunning({ done, total: queue.length, etaMs: eta(done) });
        }
      }),
    );
    setRunning(null);

    // Phrase cards that were just generated also get cards for their parts.
    const fresh = await db.deck_units.where(":id").anyOf(queue.map((u) => u.id!)).toArray();
    await addComponentCards(fresh.filter((u) => u.status === "generated" && !u.componentOf));
  };

  const pendingCards = () => units.filter((u) => u.status === "pending");

  const generateBatch = async () => runQueue((await sortOutFormatted(pendingCards())).slice(0, BATCH));

  // Step 1 is the free format check: cards already in the new format are set aside.
  // Step 2 asks before spending anything, with the real number left to generate.
  const generateAll = async () => {
    const before = pendingCards().length;
    const remaining = await sortOutFormatted(pendingCards());
    if (remaining.length === 0) return;
    const ok = window.confirm(
      `${before - remaining.length} cards were already in the new format and set aside. ` +
        `Generate the other ${remaining.length}? Estimated cost about $${(remaining.length * COST_PER_CARD).toFixed(2)}.`,
    );
    if (ok) await runQueue(remaining);
  };

  // Cards the user picked explicitly are generated even if they look formatted;
  // only pending ones go through the format check first.
  const generateSelectedCards = async () => {
    const pending = selectedToGenerate.filter((u) => u.status === "pending");
    const forced = selectedToGenerate.filter((u) => u.status !== "pending");
    await runQueue([...(await sortOutFormatted(pending)), ...forced]);
    setSelected(new Set());
  };

  const finishBackfill = async (apply: boolean) => {
    if (apply) {
      const all = await db.deck_units.toArray();
      await addComponentCards(all.filter((u) => !u.componentOf));
    }
    try {
      localStorage.setItem(BACKFILL_KEY, "done");
    } catch {
      // not remembered
    }
    setBackfillOpen(false);
  };

  const setStatus = async (ids: number[], status: Status) => {
    if (ids.length === 0) return;
    await db.deck_units.where(":id").anyOf(ids).modify({ status });
    const done = new Set(ids);
    setUnits((prev) => prev.map((u) => (u.id !== undefined && done.has(u.id) ? { ...u, status } : u)));
    setSelected(new Set());
  };

  const approveIds = async (ids: number[]) => {
    if (ids.length === 0) return;
    await db.deck_units.where(":id").anyOf(ids).modify({ status: "approved" });
    const done = new Set(ids);
    setUnits((prev) => prev.map((u) => (u.id !== undefined && done.has(u.id) ? { ...u, status: "approved" } : u)));
    setSelected(new Set());
  };

  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const regenerate = async (u: DeckUnitRecord) => {
    setError("");
    await generateOne(u);
  };

  const saveAccessCode = (value: string) => {
    setAccessCode(value);
    storeAccessCode(value);
  };

  const exportApproved = () => {
    const approved = units.filter((u) => u.status === "approved" && u.newBack);
    const out = buildAnkiTsv(approved.map((u) => ({ front: u.front, back: u.newBack!, type: u.type, tags: u.tags })));
    const url = URL.createObjectURL(new Blob([out.tsv], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hanzisave-cards.txt";
    a.click();
    URL.revokeObjectURL(url);
    const originals = [...new Set(approved.filter((u) => u.splitFrom).map((u) => u.splitFrom!))];
    setExported(
      `Exported ${out.count} cards.` +
        (out.skippedDuplicates.length
          ? ` Left out ${out.skippedDuplicates.length} duplicate fronts: ${out.skippedDuplicates.join(", ")}.`
          : "") +
        (originals.length ? ` After importing, delete these old combined notes in Anki: ${originals.join(", ")}.` : ""),
    );
  };

  if (loaded && units.length === 0) {
    return (
      <div className={styles.page}>
        <Link href="/import" className={styles.back}>
          ← Import
        </Link>
        <div className={styles.panel}>No cards in the library yet. Import your Anki deck first.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/import" className={styles.back}>
          ← Import
        </Link>
        <div className={styles.title}>Rewrite deck</div>
      </div>

      {backfillOpen && units.length > 0 && (
        <div className={styles.panel}>
          <div>
            <b>One-time step.</b> Split your existing fixed expressions (like 注册银行卡) into their parts and add the
            parts you don&apos;t have yet as new cards. From now on this happens automatically whenever cards are generated.
          </div>
          <div className={styles.row}>
            <button className={styles.primary} onClick={() => finishBackfill(true)} disabled={!!running}>
              Create component cards now
            </button>
            <button className={styles.secondary} onClick={() => finishBackfill(false)} disabled={!!running}>
              Skip
            </button>
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.row}>
          <button className={styles.primary} onClick={generateBatch} disabled={!!running || counts.pending === 0}>
            {running
              ? `Generating ${running.done}/${running.total}${running.etaMs !== null ? ` · ${formatEta(running.etaMs)}` : ""}…`
              : `Generate next ${Math.min(BATCH, counts.pending)}`}
          </button>
          <button className={styles.secondary} onClick={generateAll} disabled={!!running || counts.pending === 0}>
            Generate all {counts.pending}
          </button>
          {running && (
            <button className={styles.secondary} onClick={() => (stop.current = true)}>
              Stop
            </button>
          )}
          <label className={styles.code}>
            Access code
            <input type="password" value={accessCode} onChange={(e) => saveAccessCode(e.target.value)} />
          </label>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {notice && <div className={styles.hint}>{notice}</div>}
        <div className={styles.row}>
          <button className={styles.secondary} onClick={exportApproved} disabled={counts.approved === 0}>
            Export {counts.approved} approved as Anki file
          </button>
        </div>
        {exported && <div className={styles.hint}>{exported}</div>}
      </div>

      <input
        className={styles.search}
        type="search"
        placeholder="Search hanzi, pinyin or meaning…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      {needle && (
        <div className={styles.hint}>
          {shown.length} {shown.length === 1 ? "card matches" : "cards match"} “{needle}” across all lists.
        </div>
      )}

      <div className={styles.tabs}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? styles.on : undefined}
            onClick={() => {
              setFilter(f.key);
              setPage(0);
            }}
          >
            {f.label} {counts[f.key]}
          </button>
        ))}
      </div>

      {units.length > 0 && (
        <div className={styles.row}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleIds.length === 0}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const id of visibleIds) {
                    if (allVisibleSelected) next.delete(id);
                    else next.add(id);
                  }
                  return next;
                })
              }
            />
            Select all on this page
          </label>
          <span className={styles.hint}>{selectedCards.length} selected</span>
          <button
            className={styles.primary}
            disabled={selectedToGenerate.length === 0 || !!running}
            onClick={generateSelectedCards}
          >
            Generate selected ({selectedToGenerate.length})
          </button>
          <button
            className={styles.primary}
            disabled={selectedToApprove.length === 0}
            onClick={() => approveIds(selectedToApprove)}
          >
            Approve selected ({selectedToApprove.length})
          </button>
          <button className={styles.secondary} disabled={approvableAll.length === 0} onClick={() => approveIds(approvableAll)}>
            Approve all {approvableAll.length}
          </button>
          {toConfirmAll.length > 0 && (
            <>
              <button
                className={styles.primary}
                disabled={selectedToConfirm.length === 0}
                onClick={() => setStatus(selectedToConfirm, "confirmed")}
              >
                Confirm selected ({selectedToConfirm.length})
              </button>
              <button className={styles.secondary} onClick={() => setStatus(toConfirmAll, "confirmed")}>
                Confirm all {toConfirmAll.length} in format
              </button>
            </>
          )}
          {selectedCards.length > 0 && (
            <button className={styles.secondary} onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          )}
          {selectedOverwrites > 0 && (
            <span className={styles.warn}>Generating replaces the existing rewrite on {selectedOverwrites} of them.</span>
          )}
        </div>
      )}

      {visible.map((u) => {
        const draft = editing && editing.id === u.id ? editing : null;
        return (
        <div key={u.id} className={styles.card}>
          <div className={styles.cardHead}>
            <input
              type="checkbox"
              aria-label={`Select ${u.front}`}
              checked={selected.has(u.id!)}
              onChange={() => toggleSelected(u.id!)}
            />
            <span className={styles.front}>{u.front}</span>
            <span className={styles.badge}>{u.type}</span>
            <span className={styles.badge}>was {u.format}</span>
            {u.splitFrom && <span className={styles.badge}>split from {u.splitFrom}</span>}
            {u.componentOf && <span className={styles.badge}>part of {u.componentOf}</span>}
            {duplicateFronts.has(u.front) && <span className={styles.warn}>duplicate front</span>}
            {u.stale && <span className={styles.warn}>source changed in Anki after this rewrite</span>}
            {u.missing && <span className={styles.warn}>no longer in Anki</span>}
          </div>

          <div className={styles.cols}>
            <div>
              <div className={styles.label}>Old</div>
              <pre className={styles.pre}>{u.oldBack || "New card: there is no existing text."}</pre>
            </div>
            <div>
              <div className={styles.label}>New</div>
              {draft ? (
                <textarea
                  className={styles.textarea}
                  value={draft.text}
                  onChange={(e) => setEditing({ id: u.id!, text: e.target.value })}
                />
              ) : u.newBack ? (
                <pre className={styles.pre}>{u.newBack}</pre>
              ) : (
                <div className={styles.muted}>
                  {u.status === "failed"
                    ? (u.problems ?? []).join("; ")
                    : u.status === "in_format" || u.status === "confirmed"
                      ? "Not regenerated: the existing Back already follows the card format."
                      : "Not generated yet"}
                </div>
              )}
              {u.changed && <div className={styles.warn}>Model says it corrected: {u.changed}</div>}
            </div>
          </div>

          <div className={styles.actions}>
            {draft ? (
              <>
                <button
                  className={styles.primary}
                  onClick={async () => {
                    await patch(u.id!, { newBack: draft.text.trim(), status: "approved", stale: false });
                    setEditing(null);
                  }}
                >
                  Save & approve
                </button>
                <button className={styles.secondary} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                {u.status === "in_format" && (
                  <button className={styles.primary} onClick={() => patch(u.id!, { status: "confirmed" })}>
                    Looks right
                  </button>
                )}
                {u.status === "confirmed" && (
                  <button className={styles.secondary} onClick={() => patch(u.id!, { status: "in_format" })}>
                    Re-check
                  </button>
                )}
                {u.newBack && u.status !== "approved" && (
                  <button className={styles.primary} onClick={() => patch(u.id!, { status: "approved" })}>
                    Approve
                  </button>
                )}
                {u.newBack && (
                  <button className={styles.secondary} onClick={() => setEditing({ id: u.id!, text: u.newBack! })}>
                    Edit
                  </button>
                )}
                <button className={styles.secondary} onClick={() => regenerate(u)} disabled={!!running}>
                  {u.newBack ? "Regenerate" : u.status === "in_format" || u.status === "confirmed" ? "Generate anyway" : "Generate"}
                </button>
                {u.status !== "skipped" && (
                  <button className={styles.secondary} onClick={() => patch(u.id!, { status: "skipped" })}>
                    Skip
                  </button>
                )}
                {u.status === "approved" && (
                  <button className={styles.secondary} onClick={() => patch(u.id!, { status: "generated" })}>
                    Unapprove
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        );
      })}

      {shown.length === 0 && loaded && <div className={styles.panel}>Nothing in this list.</div>}

      {pageCount > 1 && (
        <div className={styles.row}>
          <button className={styles.secondary} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            ← Prev
          </button>
          <span className={styles.hint}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            className={styles.secondary}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

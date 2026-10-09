"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./rewrite.module.css";
import { db, type DeckUnitRecord } from "@/lib/db";
import { CardRequestError, requestCard } from "@/lib/card-client";
import { buildAnkiTsv, splitChanged } from "@/lib/rewrite";

type Status = DeckUnitRecord["status"];
type Filter = Status | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "generated", label: "To review" },
  { key: "approved", label: "Approved" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 15;
const BATCH = 25;
const CONCURRENCY = 3;
const CODE_KEY = "hanzisave.accessCode";

// Cards that have a rewrite waiting for approval.
const approvable = (u: DeckUnitRecord) => !!u.newBack && u.status !== "approved";
// Bulk actions skip cards whose source changed in Anki after they were rewritten.
const bulkApprovable = (u: DeckUnitRecord) => approvable(u) && !u.stale;

export default function RewritePage() {
  const [units, setUnits] = useState<DeckUnitRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(0);
  const [accessCode, setAccessCode] = useState("");
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [exported, setExported] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const stop = useRef(false);

  useEffect(() => {
    db.deck_units.toArray().then((all) => {
      setUnits(all);
      try {
        setAccessCode(localStorage.getItem(CODE_KEY) ?? "");
      } catch {
        // storage can be unavailable (private window); the code just isn't remembered
      }
      setLoaded(true);
    });
  }, []);

  const patch = async (id: number, changes: Partial<DeckUnitRecord>) => {
    await db.deck_units.update(id, changes);
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { pending: 0, generated: 0, approved: 0, failed: 0, skipped: 0, all: units.length };
    for (const u of units) c[u.status]++;
    return c;
  }, [units]);

  const duplicateFronts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const u of units) seen.set(u.front, (seen.get(u.front) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([f]) => f));
  }, [units]);

  const shown = useMemo(() => units.filter((u) => filter === "all" || u.status === filter), [units, filter]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const visible = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleApprovable = visible.filter(bulkApprovable).map((u) => u.id!);
  const allVisibleSelected = visibleApprovable.length > 0 && visibleApprovable.every((id) => selected.has(id));
  const approvableAll = units.filter(bulkApprovable).map((u) => u.id!);
  // Selection can go stale (a card approved, skipped or edited elsewhere), so count only live ones.
  const selectedIds = approvableAll.filter((id) => selected.has(id));

  const generateOne = async (u: DeckUnitRecord) => {
    try {
      const raw = await requestCard({ item: u.front, type: u.type, oldBack: u.oldBack }, accessCode || undefined);
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

  const generateBatch = async () => {
    const queue = units.filter((u) => u.status === "pending").slice(0, BATCH);
    if (queue.length === 0) return;
    stop.current = false;
    setError("");
    setRunning({ done: 0, total: queue.length });
    let next = 0;
    let done = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < queue.length && !stop.current) {
          await generateOne(queue[next++]);
          setRunning({ done: ++done, total: queue.length });
        }
      }),
    );
    setRunning(null);
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
    try {
      localStorage.setItem(CODE_KEY, value);
    } catch {
      // see above
    }
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

      <div className={styles.panel}>
        <div className={styles.row}>
          <button className={styles.primary} onClick={generateBatch} disabled={!!running || counts.pending === 0}>
            {running ? `Generating ${running.done}/${running.total}…` : `Generate next ${Math.min(BATCH, counts.pending)}`}
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
        <div className={styles.row}>
          <button className={styles.secondary} onClick={exportApproved} disabled={counts.approved === 0}>
            Export {counts.approved} approved as Anki file
          </button>
        </div>
        {exported && <div className={styles.hint}>{exported}</div>}
      </div>

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

      {approvableAll.length > 0 && (
        <div className={styles.row}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleApprovable.length === 0}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const id of visibleApprovable) {
                    if (allVisibleSelected) next.delete(id);
                    else next.add(id);
                  }
                  return next;
                })
              }
            />
            Select all on this page
          </label>
          <button
            className={styles.primary}
            disabled={selectedIds.length === 0}
            onClick={() => approveIds(selectedIds)}
          >
            Approve selected ({selectedIds.length})
          </button>
          <button className={styles.secondary} onClick={() => approveIds(approvableAll)}>
            Approve all {approvableAll.length}
          </button>
        </div>
      )}

      {visible.map((u) => {
        const draft = editing && editing.id === u.id ? editing : null;
        return (
        <div key={u.id} className={styles.card}>
          <div className={styles.cardHead}>
            {bulkApprovable(u) && (
              <input
                type="checkbox"
                aria-label={`Select ${u.front}`}
                checked={selected.has(u.id!)}
                onChange={() => toggleSelected(u.id!)}
              />
            )}
            <span className={styles.front}>{u.front}</span>
            <span className={styles.badge}>{u.type}</span>
            <span className={styles.badge}>was {u.format}</span>
            {u.splitFrom && <span className={styles.badge}>split from {u.splitFrom}</span>}
            {duplicateFronts.has(u.front) && <span className={styles.warn}>duplicate front</span>}
            {u.stale && <span className={styles.warn}>source changed in Anki after this rewrite</span>}
            {u.missing && <span className={styles.warn}>no longer in Anki</span>}
          </div>

          <div className={styles.cols}>
            <div>
              <div className={styles.label}>Old</div>
              <pre className={styles.pre}>{u.oldBack}</pre>
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
                  {u.status === "failed" ? (u.problems ?? []).join("; ") : "Not generated yet"}
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
                  {u.newBack ? "Regenerate" : "Generate"}
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

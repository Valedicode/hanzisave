"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { analyze, type AnalyzeResult, type AnalyzedWord } from "@/lib/analyze";
import type { HskLevel } from "@/lib/lexicon";
import { getGloss } from "@/lib/gloss";
import type { Gloss } from "@/lib/gloss-schema";
import { db } from "@/lib/db";

const LEVEL_COLOR: Record<number, string> = {
  0: "var(--oov)",
  1: "var(--h1)",
  2: "var(--h2)",
  3: "var(--h3)",
  4: "var(--h4)",
  5: "var(--h5)",
  6: "var(--h6)",
};

const SAMPLE =
  "中国的经济在过去四十年里发生了巨大的变化。很多城市的年轻人喜欢用手机点外卖，而不是自己做饭。这种生活方式虽然方便，但也带来了一些健康问题。";

const isHan = (s: string) => /\p{Script=Han}/u.test(s);
const wordKey = (sentenceId: string, word: AnalyzedWord) => `${sentenceId}:${word.start}`;

interface Selected {
  key: string;
  sentenceText: string;
  word: AnalyzedWord;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [learnerLevel, setLearnerLevel] = useState<HskLevel>(3);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [selected, setSelected] = useState<Selected | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    db.cards.count().then(setSavedCount);
  }, []);

  const handleAnalyze = () => {
    if (!text.trim()) return;
    setOverrides(new Map());
    setSelected(null);
    setResult(analyze(text, learnerLevel));
  };

  const isFlagged = (sentenceId: string, word: AnalyzedWord) => {
    const key = wordKey(sentenceId, word);
    return overrides.has(key) ? overrides.get(key)! : word.flagged;
  };

  const toggleFlag = (sentenceId: string, word: AnalyzedWord) => {
    const key = wordKey(sentenceId, word);
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isFlagged(sentenceId, word));
      return next;
    });
  };

  const headline = useMemo(() => {
    if (!result) return null;
    const [a, b] = result.summary.dominantLevels;
    return a === b ? `HSK ${a}` : `HSK ${Math.min(a, b)}–${Math.max(a, b)}`;
  }, [result]);

  const flaggedWords = useMemo(() => {
    if (!result) return [];
    return result.sentences.flatMap((s) =>
      s.words.filter((w) => isHan(w.surface) && isFlagged(s.id, w)).map((w) => ({ sentence: s, word: w }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, overrides]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>汉</div>
        <div className={styles.title}>HanziSave</div>
        {savedCount > 0 && <span className={styles.savedBadge}>{savedCount} cards saved</span>}
      </div>

      <div className={styles.legend}>
        {([1, 2, 3, 4, 5, 6] as const).map((lv) => (
          <span key={lv} className={styles.legendItem}>
            <span className={styles.dot} style={{ background: LEVEL_COLOR[lv] }} />
            HSK {lv}
          </span>
        ))}
        <span className={styles.legendItem}>
          <span className={styles.dot} style={{ background: LEVEL_COLOR[0] }} />
          Unknown
        </span>
      </div>

      <div className={styles.panel}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="把中文文章、聊天记录或课文粘贴到这里… (paste Chinese text here)"
        />
        <div className={styles.controlsRow}>
          <label className={styles.levelPicker}>
            Your level
            <select
              className={styles.levelSelect}
              value={learnerLevel}
              onChange={(e) => setLearnerLevel(Number(e.target.value) as HskLevel)}
            >
              {([1, 2, 3, 4, 5, 6] as const).map((lv) => (
                <option key={lv} value={lv}>
                  HSK {lv}
                </option>
              ))}
            </select>
          </label>
          <button className={styles.analyzeBtn} onClick={handleAnalyze} disabled={!text.trim()}>
            Analyze text →
          </button>
        </div>
      </div>

      {result && (
        <div className={styles.panel}>
          <div className={styles.summary}>
            <span className={styles.summaryBadge} style={{ background: "var(--brand)" }}>
              {headline}
            </span>
            <span>a good stretch to read at HSK {learnerLevel}</span>
            <span>· {flaggedWords.length} words flagged</span>
            <span>· {Math.round(result.summary.coverage * 100)}% lexicon coverage</span>
          </div>

          {result.sentences.map((s) => (
            <p key={s.id} className={styles.sentence}>
              {s.words.map((w, i) => {
                const clickable = isHan(w.surface);
                const flagged = clickable && isFlagged(s.id, w);
                const key = wordKey(s.id, w);
                return (
                  <span
                    key={i}
                    className={[
                      styles.word,
                      flagged ? styles.flagged : "",
                      w.level === null && clickable ? styles.oov : "",
                      clickable ? styles.clickable : "",
                      selected?.key === key ? styles.selected : "",
                    ].join(" ")}
                    style={
                      w.level !== null
                        ? { borderBottomColor: LEVEL_COLOR[w.level], color: LEVEL_COLOR[w.level] }
                        : undefined
                    }
                    title={w.level !== null ? `HSK ${w.level}` : clickable ? "Not in HSK 1–6" : undefined}
                    onClick={clickable ? () => setSelected({ key, sentenceText: s.text, word: w }) : undefined}
                  >
                    {w.surface}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      )}

      {selected && (
        <WordPopover
          key={selected.key}
          sentenceText={selected.sentenceText}
          word={selected.word}
          flagged={isFlagged(selected.key.split(":")[0], selected.word)}
          onToggleFlag={() => toggleFlag(selected.key.split(":")[0], selected.word)}
          onSaved={() => setSavedCount((n) => n + 1)}
          onClose={() => setSelected(null)}
        />
      )}

      {flaggedWords.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.summary}>
            <span style={{ fontWeight: 900, color: "var(--brand-deep)" }}>Flagged words</span>
            <span>{flaggedWords.length}</span>
          </div>
          <div className={styles.flaggedList}>
            {flaggedWords.map(({ sentence, word }, i) => (
              <button
                key={i}
                className={styles.flaggedChip}
                onClick={() => setSelected({ key: wordKey(sentence.id, word), sentenceText: sentence.text, word })}
              >
                {word.surface}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WordPopover({
  sentenceText,
  word,
  flagged,
  onToggleFlag,
  onSaved,
  onClose,
}: {
  sentenceText: string;
  word: AnalyzedWord;
  flagged: boolean;
  onToggleFlag: () => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [gloss, setGloss] = useState<Gloss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGloss(word.surface, sentenceText)
      .then((g) => !cancelled && setGloss(g))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "failed to load gloss"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [word.surface, sentenceText]);

  const handleSave = async () => {
    if (!gloss) return;
    await db.cards.add({
      word: word.surface,
      level: word.level,
      pinyin: gloss.pinyin,
      gloss: gloss.gloss,
      example: gloss.example,
      sentenceText,
      createdAt: Date.now(),
    });
    setSaved(true);
    onSaved();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.popoverHeader}>
        <span className={styles.popoverWord}>{word.surface}</span>
        {word.level !== null && (
          <span className={styles.summaryBadge} style={{ background: LEVEL_COLOR[word.level] }}>
            HSK {word.level}
          </span>
        )}
        <button className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>

      {loading && <span>Loading gloss…</span>}
      {error && <span style={{ color: "var(--h5)" }}>{error}</span>}
      {gloss && (
        <>
          <div className={styles.popoverPinyin}>{gloss.pinyin}</div>
          <div>{gloss.gloss}</div>
          <div className={styles.exampleBox}>{gloss.example}</div>
        </>
      )}

      <div className={styles.controlsRow}>
        <button className={styles.analyzeBtn} style={{ background: flagged ? "var(--h5)" : "var(--brand)" }} onClick={onToggleFlag}>
          {flagged ? "Unflag" : "Flag for review"}
        </button>
        <button className={styles.analyzeBtn} onClick={handleSave} disabled={!gloss || saved}>
          {saved ? "Saved ✓" : "Save as flashcard"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";
import { analyze, type AnalyzeResult } from "@/lib/analyze";
import type { HskLevel } from "@/lib/lexicon";

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

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [learnerLevel, setLearnerLevel] = useState<HskLevel>(3);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const handleAnalyze = () => {
    if (!text.trim()) return;
    setResult(analyze(text, learnerLevel));
  };

  const headline = useMemo(() => {
    if (!result) return null;
    const [a, b] = result.summary.dominantLevels;
    return a === b ? `HSK ${a}` : `HSK ${Math.min(a, b)}–${Math.max(a, b)}`;
  }, [result]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.logo}>汉</div>
        <div className={styles.title}>HanziSave</div>
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
            <span>· {result.summary.flaggedCount} words flagged</span>
            <span>· {Math.round(result.summary.coverage * 100)}% lexicon coverage</span>
          </div>

          {result.sentences.map((s) => (
            <p key={s.id} className={styles.sentence}>
              {s.words.map((w, i) => (
                <span
                  key={i}
                  className={[
                    styles.word,
                    w.flagged ? styles.flagged : "",
                    w.level === null && /\p{Script=Han}/u.test(w.surface) ? styles.oov : "",
                  ].join(" ")}
                  style={
                    w.level !== null
                      ? { borderBottomColor: LEVEL_COLOR[w.level], color: LEVEL_COLOR[w.level] }
                      : undefined
                  }
                  title={w.level !== null ? `HSK ${w.level}` : /\p{Script=Han}/u.test(w.surface) ? "Not in HSK 1–6" : undefined}
                >
                  {w.surface}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

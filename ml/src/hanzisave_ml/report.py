from __future__ import annotations

from collections import Counter

import pandas as pd

from .silver_label import RULES


def silver_report(df: pd.DataFrame) -> str:
    lines = ["# Silver corpus report", ""]
    lines.append(f"Sentences: {len(df):,}  ·  with ≥1 lexicon match: {(df.n_known > 0).sum():,}")
    lines.append("")

    lines.append("## Coverage (matched words / CJK tokens)")
    q = df.coverage.quantile([0.1, 0.25, 0.5, 0.75, 0.9]).round(3)
    lines.append("| p10 | p25 | p50 | p75 | p90 |")
    lines.append("|---|---|---|---|---|")
    lines.append("| " + " | ".join(str(v) for v in q) + " |")
    lines.append("")

    lines.append("## Label distribution by rule (0 = unlabeled / no matches)")
    lines.append("| rule | " + " | ".join(f"L{i}" for i in range(7)) + " |")
    lines.append("|---|" + "---|" * 7)
    for rule in RULES:
        counts = df[f"label_{rule}"].value_counts()
        row = [f"{counts.get(i, 0):,}" for i in range(7)]
        lines.append(f"| {rule} | " + " | ".join(row) + " |")
    lines.append("")

    oov = Counter()
    for words in df.oov_words:
        oov.update(words)
    lines.append("## Top 40 OOV tokens (what the lexicon can't see)")
    lines.append(", ".join(f"{w} ({n:,})" for w, n in oov.most_common(40)))
    lines.append("")
    return "\n".join(lines)

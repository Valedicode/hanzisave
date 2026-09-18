"""Score every pool sentence against the lexicon, attach all silver-label rules, split train/val, write a report."""

import argparse

import pandas as pd
from sklearn.model_selection import train_test_split
from tqdm import tqdm

from hanzisave_ml.lexicon import Lexicon
from hanzisave_ml.paths import POOL_PARQUET, SILVER_DIR
from hanzisave_ml.report import silver_report
from hanzisave_ml.silver_label import RULES, label, score

ap = argparse.ArgumentParser()
ap.add_argument("--min-support", type=int, default=2)
ap.add_argument("--val-frac", type=float, default=0.05)
ap.add_argument("--seed", type=int, default=0)
args = ap.parse_args()

lex = Lexicon.load()
pool = pd.read_parquet(POOL_PARQUET)

records = []
for sentence in tqdm(pool.sentence, desc="scoring"):
    st = score(sentence, lex)
    rec = {
        "n_words": st.n_words,
        "n_known": st.n_known,
        "coverage": st.coverage,
        "mean_level": st.mean_level,
        "oov_words": st.oov_words,
    }
    for rule in RULES:
        rec[f"label_{rule}"] = label(st, rule, args.min_support)
    records.append(rec)

df = pd.concat([pool.reset_index(drop=True), pd.DataFrame(records)], axis=1)

SILVER_DIR.mkdir(parents=True, exist_ok=True)
df.to_parquet(SILVER_DIR / "all.parquet", index=False)

labeled = df[df.n_known > 0]
train, val = train_test_split(labeled, test_size=args.val_frac, random_state=args.seed, stratify=labeled.label_max)
train.to_parquet(SILVER_DIR / "train.parquet", index=False)
val.to_parquet(SILVER_DIR / "val.parquet", index=False)

report = silver_report(df)
(SILVER_DIR / "REPORT.md").write_text(report, encoding="utf-8")
print(report)
print(f"train={len(train):,}  val={len(val):,}  unlabeled={(df.n_known == 0).sum():,}")

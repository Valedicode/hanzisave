"""Stream zh-Wikipedia, normalize to simplified, split into sentences, write data/pool/wikipedia_sentences.parquet."""

import argparse

import pandas as pd
from tqdm import tqdm

from hanzisave_ml.corpus import iter_wikipedia_sentences
from hanzisave_ml.paths import POOL_PARQUET

ap = argparse.ArgumentParser()
ap.add_argument("--max-sentences", type=int, default=200_000)
ap.add_argument("--max-per-article", type=int, default=10)
ap.add_argument("--seed", type=int, default=0)
args = ap.parse_args()

POOL_PARQUET.parent.mkdir(parents=True, exist_ok=True)
rows = list(tqdm(
    iter_wikipedia_sentences(args.max_sentences, max_per_article=args.max_per_article, seed=args.seed),
    total=args.max_sentences,
))
pd.DataFrame(rows).to_parquet(POOL_PARQUET, index=False)
print(f"wrote {POOL_PARQUET}  ({len(rows):,} sentences)")

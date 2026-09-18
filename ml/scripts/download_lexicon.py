"""Fetch the HSK 3.0 word lexicon (Tiagodfs/hsk-3.0-dataset, CC0-1.0) into data/lexicon/hsk.csv."""

import shutil

from huggingface_hub import hf_hub_download

from hanzisave_ml.lexicon import Lexicon
from hanzisave_ml.paths import LEXICON_CSV

LEXICON_CSV.parent.mkdir(parents=True, exist_ok=True)
src = hf_hub_download("Tiagodfs/hsk-3.0-dataset", "hsk.csv", repo_type="dataset")
shutil.copy(src, LEXICON_CSV)

lex = Lexicon.load()
print(f"wrote {LEXICON_CSV}  ({len(lex):,} unique words)")

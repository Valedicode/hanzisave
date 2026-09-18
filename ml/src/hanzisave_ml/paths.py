from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[2]
DATA = ML_ROOT / "data"
LEXICON_CSV = DATA / "lexicon" / "hsk.csv"
POOL_PARQUET = DATA / "pool" / "wikipedia_sentences.parquet"
SILVER_DIR = DATA / "silver"
GOLD_CSV = DATA / "gold" / "gold.csv"

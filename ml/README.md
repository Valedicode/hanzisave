# hanzisave-ml

Data construction, baselines, fine-tuning and evaluation for the Chinese sentence-difficulty classifier. Independent of the app — the app only consumes an exported checkpoint. Full plan: `../docs/PLAN.md`.

## Setup

```sh
conda create -n hanzisave python=3.11
conda activate hanzisave
cd ml
pip install -e .                  # core deps
pip install -e ".[train]"         # + torch/transformers (for fine-tuning)
pip install -e ".[llm]"           # + anthropic (for the LLM baseline)
```

## Pipeline

```sh
python scripts/download_lexicon.py                     # → data/lexicon/hsk.csv        (CC0)
python scripts/build_pool.py --max-sentences 200000    # → data/pool/*.parquet          (CC-BY-SA, gitignored)
python scripts/build_silver.py --min-support 2         # → data/silver/{all,train,val}.parquet + REPORT.md
```

`build_silver.py` stores every labeling rule (`label_max`, `label_supported_max`, `label_p90`) side by side, so choosing a rule later is a column pick, not a rebuild.

## Layout

```
data/lexicon/   HSK 3.0 word list (committed)
data/pool/      raw sentence pool (gitignored, rebuild with build_pool.py)
data/silver/    distant-supervision output (parquet gitignored; REPORT.md committed)
data/gold/      hand-labeled eval set + GUIDELINES.md (committed; never trained on)
src/hanzisave_ml/
  lexicon.py      word → level, registers words as jieba user dict
  segment.py      sentence split, CJK tokenization
  silver_label.py per-sentence stats + labeling rules
  corpus.py       zh-Wikipedia streaming + t2s normalization
  report.py       coverage / label-distribution report
scripts/        one script per pipeline stage
```

## Next stages (not yet built)

- OOV max-match fallback — jieba sometimes merges known words into one OOV token (`工作效率`, `继续下去`); greedily splitting OOV tokens into lexicon words should raise coverage noticeably. Measure before/after on the silver report.
- `baselines.py` — lookup heuristic, linguistic features + LR/RF, LLM zero-shot
- `eval.py` — accuracy, macro-F1 per level, QWK, MAE, OOV coverage → one table
- `notebooks/` — Kaggle fine-tune of `hfl/chinese-macbert-base`

# HanziSave — Project Plan

_Draft 2026-09-18. Living document; edit freely._

## TL;DR

HanziSave turns any Chinese text a learner is actually reading into level-graded flashcards and tracks their level as they review. The technical core is a **fine-tuned Chinese sentence-difficulty classifier** trained on a self-constructed, releasable corpus; the product around it is the instrument that (a) gives the model a reason to exist and (b) collects the per-learner review data that no public dataset currently provides for Chinese.

Two audiences, one codebase:

| Audience | What matters | Deliverable |
|---|---|---|
| NLP course (proposal due 2026-11-01) | A real trained model, honest baselines, failure analysis | `ml/` — reproducible data construction, fine-tune, eval table |
| Future product / research | A usable app, a citable dataset, learner interaction data | `apps/`, `services/`, and a released gold+silver corpus |

`ml/` must never depend on the app. The app consumes an exported checkpoint. If the app is half-done on Nov 1, the report is still complete.

---

## 1. Product

### Who it's for
Intermediate Chinese learners (HSK 2–5) who want to read real material — news, chats, textbooks, novels — rather than curated graded readers, and who lose vocabulary because "look it up and move on" doesn't stick.

### Core loop
```
paste / upload text
   → every word colored by HSK level, unknown words dashed
   → headline: "this text is mostly HSK 3–4 — a good stretch for you"
   → words above your level are auto-flagged; tap any word to add/remove
   → review session (flip, again / got it), keyboard-driven
   → level estimate + streak update; due cards come back tomorrow
```

### Screens (already prototyped in `HanziSave.dc.html`)
1. **Welcome** — value prop, HSK legend.
2. **Placement** — 7-word yes/no quick check → starting level. (Prototype uses fixed words; v1 should sample one word per level from the lexicon and estimate via a simple ability score.)
3. **Goals** — daily target + motivation (used for copy/personalization only in v1).
4. **Analyze** — paste box, recent texts with a level-distribution bar per text.
5. **Analysis** — per-word coloring, popover with pinyin/gloss/level/"save as flashcard", flagged-words sidebar, text-level summary.
6. **Review** — card front (hanzi ± pinyin), back (pinyin, gloss, the original sentence with the word highlighted), again/got-it, XP, completion screen.
7. **Progress** — streak, level ring with % to next level, due count, words learned by level, weekly bar chart, milestones.

### What ships in v1 (web) vs. later
| v1 (web, PWA-installable) | Later |
|---|---|
| Real segmentation + lexicon lookup per word | Native mobile app (Expo) with push reminders |
| Fine-tuned classifier for sentence/text level | Personalized difficulty model trained on review logs |
| Contextual gloss + example sentence via LLM (cached) | OCR / share-sheet ingestion, browser extension |
| FSRS scheduling, real due queue | Social / shared decks |
| Streak, level estimate, per-level word counts | Cursor/eye-tracking reading assistance (explicitly out of scope) |
| Anki `.apkg` export | |

---

## 2. Novelty — what is actually new here

Be precise about this; it's the section a reviewer or grader will probe.

**Not novel (and we should say so):** fine-tuning a Chinese BERT for readability. Tan et al. (COLING 2025) and predecessors have done this. Our MacBERT model is their "BERT baseline" row trained on our own labels.

**Novel / contribution-grade:**

1. **A releasable sentence-level Chinese difficulty corpus.** Verified 2026-09-17: no public, clearly-licensed sentence-level HSK-graded corpus exists — the COLING paper's own datasets are not downloadable. We build one via distant supervision from a CC0 word-level HSK 3.0 lexicon over CC-BY-SA Chinese Wikipedia, plus a hand-labeled gold set with written guidelines. Dataset papers of this shape are standard at BEA / NLP4CALL.
2. **Silver-label noise as the object of study.** The training labels are heuristic; the gold set is clean. How much of the silver→gold gap closes with a better labeling rule vs. a better model is a real, answerable question with a clear failure-analysis story (label noise vs. segmentation errors vs. OOV vs. genuine ambiguity).
3. **The product as a data-collection instrument for personalized difficulty.** Duolingo SLAM (2018) is the reference for per-learner difficulty modeling and has no Chinese track. Every review in HanziSave is a `(learner, word, sentence, outcome)` row. This is the only realistic path to a Chinese personalized-difficulty dataset, and it's what turns the app from a demo into a research asset.
4. **"Your own text" as the unit of instruction.** Existing tools either curate graded content (Du Chinese, The Chairman's Bao) or annotate words on any page without a learning loop (Zhongwen, Pleco). Level-aware analysis of arbitrary user text feeding a spaced-repetition loop is a product gap, not just a research one.

**Explicitly future work, not claimed:** a SLAM-style learned personalization model; real-time reading assistance; anything beyond HSK levels as the difficulty proxy (a known limitation — HSK is a curriculum, not a psychometric scale).

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  clients                                                           │
│   apps/web  (Next.js, PWA)          apps/mobile (Expo, later)      │
│         └──────── packages/api-client (generated from OpenAPI) ────┘
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS / JSON
┌───────────────────────────────▼────────────────────────────────────┐
│  services/api  (FastAPI)                                           │
│                                                                    │
│   /analyze ──► nlp.segment (jieba + lexicon user-dict)             │
│                nlp.lexicon (word → HSK level | OOV)                │
│                classifier (MacBERT checkpoint, CPU) ─► sentence lvl│
│                llm.gloss (Anthropic SDK, structured output, cached)│
│   /cards, /reviews ──► srs.fsrs (schedule) + level estimator       │
│   /progress ──► aggregates                                         │
│   /export/anki ──► genanki                                         │
│                                                                    │
│   Postgres: users, texts, sentences, words, cards, reviews,        │
│             gloss_cache(word, sentence_hash)                       │
└───────────────────────────────┬────────────────────────────────────┘
                                │ exported checkpoint only
┌───────────────────────────────▼────────────────────────────────────┐
│  ml/  (independent; the course + research deliverable)             │
│   data/lexicon  ← HF Tiagodfs/hsk-3.0-dataset (CC0)                │
│   data/pool     ← HF wikimedia/wikipedia 20231101.zh (CC-BY-SA)    │
│   data/silver   ← distant supervision (configurable rule)          │
│   data/gold     ← hand-labeled, held out, with guidelines          │
│   baselines: lookup · linguistic features + LR/RF · LLM zero-shot  │
│   train: MacBERT fine-tune (Kaggle GPU) → HF Hub checkpoint        │
│   eval: acc · macro-F1 per level · QWK · MAE · OOV coverage        │
└────────────────────────────────────────────────────────────────────┘
```

Design rules:
- **One direction of dependency**: `ml/` → checkpoint → `services/api`. Never the reverse.
- **Per-word display uses the lexicon, not the model.** The model predicts sentence level; the text-level headline is an aggregate of sentence predictions. This keeps the model's job narrow and evaluable.
- **LLM calls are enrichment, cached forever** by `(word, sentence_hash)`. Cost approaches zero as texts repeat.
- **Review events are append-only** and stored with enough context (sentence, word level, learner level at the time) to be a dataset later.

---

## 4. Technical stack

| Layer | Choice | Why |
|---|---|---|
| ML env | conda env `hanzisave` (Python 3.11), deps in `pyproject.toml` | Matches the existing Anaconda setup; `pip install -e .` inside the env |
| Segmentation | `jieba` with the HSK lexicon loaded as a user dictionary | Forces multi-char HSK words to segment as units → better coverage |
| Script normalization | `opencc` (`t2s`) | zh-Wikipedia mixes simplified/traditional |
| Data | `datasets` (streaming), `pandas`, parquet | No full dump download; sample by streaming |
| Model | `hfl/chinese-macbert-base` (fallback `bert-base-chinese`), `transformers` | 110M params, hours on a Kaggle T4 |
| Baselines | `scikit-learn` (LR / RF on features); Anthropic SDK `claude-opus-5` with structured outputs for zero-shot | Same LLM code path serves the product's gloss feature |
| Eval | `scikit-learn` metrics + `cohen_kappa_score(weights="quadratic")` | QWK matches the COLING paper |
| Backend | FastAPI, SQLAlchemy, Postgres, `pydantic` | Python hosts the whole language layer |
| SRS | FSRS (py-fsrs) | Modern, open scheduler; better than SM-2 |
| Anki export | `genanki` | Standard |
| Frontend | Next.js (App Router), TypeScript, CSS variables from the prototype's token set | PWA-first; mobile later |
| Mobile (later) | Expo / React Native | Shares `packages/api-client` + design tokens |
| Auth / hosting | TBD — Supabase (auth + Postgres) is the fastest path; Railway/Fly for the API | Decide when the app phase starts |

---

## 5. ML plan

### Data construction
1. **Lexicon**: `hsk.csv` — 5,456 words, levels 1–6, columns `id, hsk_level, chinese, pinyin, english`.
2. **Pool**: stream zh-Wikipedia, convert to simplified, split into sentences, keep 6–60 chars with ≥80% CJK, dedupe. Target 200k–500k sentences (configurable).
3. **Silver labels** — computed per sentence and stored side by side so the rule is a flag, not a rewrite:
   - `max`: highest HSK level among lexicon-matched words (baseline rule; over-labels toward 5–6)
   - `supported_max`: highest level with ≥ k matched words
   - `p90`: 90th-percentile matched-word level
   - plus `coverage` (matched / CJK tokens), `oov_count`, `n_words`
   - Sentences with zero matched words are kept but unlabeled (they're the OOV-heavy failure-analysis pool).
4. **Gold set**: 150–300 sentences, hand-labeled by the level a learner needs to read it comfortably (not the max word). Guidelines in `ml/data/gold/GUIDELINES.md`. Sources: HSK Standard Course sample sentences, graded readers, plus a stratified sample of the pool. **Never trained on.**

### Models and baselines
| # | System | Role |
|---|---|---|
| 1 | Lookup heuristic (`max` rule applied at test time) | The "no ML" app baseline to beat |
| 2 | Linguistic features (length, level proportions, coverage, punctuation density, idiom count) + LR / RF | COLING-subset features; cheap and interpretable |
| 3 | LLM zero/few-shot (`claude-opus-5`, structured output → level) | "Is fine-tuning even necessary?" — COLING found GPT-3.5 at 24–33% |
| 4 | **MacBERT fine-tuned on silver labels** | Proposed |
| 4b | MacBERT + features (late fusion) | Stretch if time allows |

### Evaluation
- Primary: accuracy, macro-F1, **per-level F1** on gold.
- Secondary: QWK (ordinal), mean absolute level error, OOV coverage rate.
- Ablations: labeling rule (`max` vs `supported_max` vs `p90`), training-set size, coverage threshold on the training pool.
- Failure analysis on gold errors, categorized: silver noise · segmentation error · OOV-heavy · genuinely mixed-level sentence.
- COLING numbers reported as context, labeled not comparable.

---

## 6. Roadmap

| Dates | Milestone | Exit criterion |
|---|---|---|
| Sep 18–21 | `ml/` scaffold; lexicon + pool + silver pipeline running; coverage report | Label distribution + coverage histogram in hand; decide course-project choice |
| Sep 22–26 | Gold labeling starts (in parallel); tighten silver rule from report | ≥ 100 gold sentences; chosen rule documented |
| Sep 27–Oct 1 | Baselines 1–2 with numbers on gold | Eval table has 2 rows |
| Oct 2–6 | MacBERT fine-tune on Kaggle; LLM baseline | Eval table has 4 rows |
| Oct 7–11 | Full eval, ablations, failure analysis | Per-level results + error taxonomy written |
| Oct 12–18 | FastAPI `/analyze` serving lookup first, then the checkpoint; Next.js Analyze + Analysis screens ported | Demo: paste → graded text with model headline |
| Oct 19–25 | Proposal draft | Full draft |
| Oct 26–Nov 1 | Buffer; early-bird submit (+2%) | Submitted |
| Nov–Dec | Review + Progress screens, FSRS, auth, deploy PWA | Usable by a first learner |
| 2027 Q1 | Expo mobile; dataset release (gold + silver + guidelines); BEA/NLP4CALL submission | |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Silver labels too noisy | `supported_max` / coverage-filtered training pool; rule is a config flag |
| Gold set slips | Shrink to ~100, state the small-N limitation |
| Fine-tune loses to lookup | Honest negative result + failure analysis scores better than a suspicious win |
| Wikipedia is stylistically far from chats/textbooks | Gold set deliberately spans genres; report per-genre if N allows |
| App work eats model time | App is gated behind "eval table has 4 rows" |
| Dataset release licensing | Wikipedia CC-BY-SA + lexicon CC0 → corpus releasable under CC-BY-SA; user-contributed text only with consent |

---

## 8. Open decisions

- [ ] Course project: HanziSave vs. distillation project — decide after the coverage report (Sep 21).
- [ ] `supported_max` k value and coverage threshold — from the report.
- [ ] Auth/hosting provider — defer to the app phase.
- [ ] Whether to run an open-weights LLM baseline (Qwen) alongside Claude for the paper.

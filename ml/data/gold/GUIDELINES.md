# Gold set labeling guidelines

The gold set is the only clean evaluation data in this project. It is **never** used for training, rule tuning, or model selection. Treat it as sealed once it reaches its target size.

## What the label means

`level` (1–6) is the **lowest HSK level at which a learner could read the sentence comfortably** — roughly: knows ~95% of the words and can get the meaning without a dictionary.

This is *not* the level of the hardest word. A HSK 2 sentence containing one guessable HSK 5 word (e.g. a transparent compound, or a word the context makes obvious) is still HSK 2–3. Conversely, a sentence built entirely from HSK 1–2 words but with a complex structure (long relative clauses, 把/被, multiple 的 chains) can be HSK 3–4.

Decide in this order:
1. Which words would a learner at level *L* not know? Are they guessable from context or characters?
2. Is the grammar within level *L*? (Use the HSK 3.0 grammar outline as reference.)
3. Pick the lowest *L* where both answers are "fine."

## Boundary rules

- Proper nouns (people, places, brands) don't raise the level unless they are unavoidable to parse the sentence.
- Numbers, dates, and Latin/ASCII don't count.
- Idioms (成语) are HSK 5+ unless in the HSK 1–4 lists.
- If genuinely torn between two levels, pick the lower one and set `confidence = low`.
- Sentences you can't confidently label at all: mark `level = 0` and explain in `notes`. These stay in the file but are excluded from metrics.

## Sources and quotas (target 150–300 total)

Aim for genre spread so the eval doesn't just measure "Wikipedia-ness":

| Source | Target share | Notes |
|---|---|---|
| Stratified sample of the Wikipedia pool | 40% | ~equal count per `label_max` bucket 1–6, plus some unlabeled |
| Textbook / HSK Standard Course style sentences | 30% | Write or adapt; do not copy licensed text verbatim |
| Conversational / chat register | 15% | Messaging-style sentences |
| News / opinion | 15% | |

## File format — `gold.csv`

| column | type | meaning |
|---|---|---|
| `id` | int | stable id |
| `sentence` | str | simplified Chinese |
| `level` | int | 1–6, or 0 if unlabelable |
| `confidence` | `high` / `low` | |
| `source` | `wiki` / `textbook` / `chat` / `news` | |
| `notes` | str | why, especially for low-confidence and 0 |

Log each labeling session (date, id range, ~time spent) at the bottom of this file so the report can state the annotation effort honestly.

## Labeling log

| date | ids | minutes | notes |
|---|---|---|---|

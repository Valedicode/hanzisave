# HanziSave

Turn the Chinese you are actually reading into Anki flashcards, and keep your existing deck in good shape.

HanziSave is a personal project that was created to help me learn chinese more efficiently. It leverages my current Claude and Anki set up by combining both benefits and identifying new cards when trying to add new words (be it manually or by scanning an image). Paste a text or photograph a page, see every word coloured by HSK level, pick the words that are new to you, and generate cards in a fixed format. Cards stay in your browser until you export them to Anki.

## What it does

- **Analyze** (`/`): segments pasted text, colours each word by HSK 3.0 level, flags words above your level, and shows pinyin and a contextual gloss.
- **Scan** (`/scan`): reads Chinese text from a photo (OCR via a vision model) or pasted text, finds words you don't know yet, and lets you generate and approve cards.
- **Import** (`/import`): loads your Anki export (`.txt` or `.apkg`) so scanning knows what you already have.
- **Rewrite** (`/rewrite`): checks existing cards against the card format, regenerates the ones that don't match, creates component cards for fixed expressions, and merges the result back into an Anki-importable file.
- **Backup**: exports and restores your library, which lives in IndexedDB (Dexie).

## Repository layout

```
apps/web/   Next.js app (TypeScript, App Router), the product
ml/         Data construction for a Chinese sentence-difficulty classifier (Python)
docs/       Project plan
```

`ml/` is independent of the app. See [`ml/README.md`](ml/README.md) for its setup and pipeline.

## Running the app

Requires Node.js and pnpm. Run everything from `apps/web`.

```sh
cd apps/web
pnpm install
cp .env.example .env     # then fill it in
pnpm dev                 # http://localhost:3000
```

### Configuration

Set these in `apps/web/.env` (see `.env.example` for details):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | An OpenAI-compatible API; OpenRouter by default |
| `CARD_MODEL` | Model that generates cards, as `provider/model` |
| `CARD_REASONING` | Reasoning effort; `off` is recommended |
| `OCR_MODEL` | Vision model for photos; falls back to `CARD_MODEL` |
| `ACCESS_CODE` | Shared secret for routes that spend API credit; required in production |
| `CARD_SPEC`, `CARD_SPEC_FILE` | The card format spec (kept out of git) |

Never commit `.env` or an API key.

### Local data files

Some files are personal or licensed and are gitignored, so a fresh clone will not have them:

- the card format spec (`docs/skills/`), unless you supply `CARD_SPEC` or `CARD_SPEC_FILE`
- your Anki exports (`*.apkg`, `Chinese Level 2.txt`)
- the HSK 3.0 word list (`ml/data/lexicon/hsk30.csv`) and the index built from it (`apps/web/public/hsk30-index.json`, via `node scripts/build-hsk30-index.mjs`)

## Checks

From `apps/web`:

```sh
node node_modules/typescript/bin/tsc --noEmit    # type check
npx tsx scripts/smoke-test.mjs                   # smoke tests (also: pnpm test)
pnpm lint
```

## Tech

Next.js 16, React 19, TypeScript, Dexie (IndexedDB), pinyin-pro, zod, fflate, and the OpenAI SDK pointed at an OpenAI-compatible provider. The app is an installable PWA.

## Plan

The longer-term plan, including the difficulty classifier and its evaluation, is in [`docs/PLAN.md`](docs/PLAN.md).

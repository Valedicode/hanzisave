// Minimal runnable check for segment()/analyze() — not a framework, just
// asserts the behaviors the v0.1 checklist depends on.
import assert from "node:assert/strict";
import { segment } from "../lib/segment.ts";
import { analyze } from "../lib/analyze.ts";
import { supportedMax } from "../lib/level.ts";
import { hashString } from "../lib/hash.ts";
import { parseAnkiExport, notesFromApkg } from "../lib/anki-import.ts";
import { planSplit } from "../lib/split-front.ts";
import { buildDeckPlan } from "../lib/deck-plan.ts";
import { buildCardPrompt, cleanCardOutput } from "../lib/card-prompt.ts";
import { hasAccess } from "../lib/access.ts";
import { checkCardFormat, checkPatternExamples } from "../lib/card-format.ts";
import { parseReasoning } from "../lib/llm/reasoning.ts";
import { generateValidCard } from "../lib/card-service.ts";
import { parseGloss } from "../lib/gloss-prompt.ts";
import { createOpenAiProvider } from "../lib/llm/openai.ts";
import { buildAnkiTsv, splitChanged, toHtmlField } from "../lib/rewrite.ts";
import { mergeDeck } from "../lib/merge-deck.ts";
import { markText, scanText } from "../lib/scan.ts";
import { addPatternPinyin, withPatternPinyin } from "../lib/pattern-pinyin.ts";
import { planComponentCards, splitComponents } from "../lib/components.ts";
import { estimateRemainingMs, etaTracker, formatEta } from "../lib/eta.ts";
import { parseBackup, serializeBackup } from "../lib/backup.ts";
import { readApkg } from "../lib/apkg.ts";
import { DatabaseSync } from "node:sqlite";
import { zstdCompressSync } from "node:zlib";
import { zipSync, strToU8 } from "fflate";
import { mkdtempSync, readFileSync as readFile, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Longest-match re-merge: ICU splits 电脑 into 电+脑, lexicon has 电脑 (HSK1).
{
  const words = segment("电脑很贵");
  const dianNao = words.find((w) => w.surface === "电脑");
  assert.ok(dianNao, "expected 电脑 to be re-merged into one token");
  assert.equal(dianNao.level, 1);
}

// Known gap (logged, not patched): ICU merges 你好 into one segment, and the
// HSK dataset only has bare 好 (level 4) — so 你好 as a whole is OOV even
// though 你 and 好 are individually basic. Feeds the v1 jieba decision.
{
  const words = segment("你好吗");
  const niHao = words.find((w) => w.surface === "你好");
  assert.ok(niHao, "expected ICU to keep 你好 as one segment");
  assert.equal(niHao.level, null);
}

// supported_max(k): needs >= k words at a level to "support" it, else falls
// back to p90 — mirrors ml/src/hanzisave_ml/silver_label.py.
{
  assert.equal(supportedMax([1, 1, 3], 2), 1);
  assert.equal(supportedMax([1, 3], 2), 1); // no level has 2 supporters -> p90([1,3]) picks the lower one
  assert.equal(supportedMax([], 2), null);
}

// analyze(): sentence splitting + per-word flagging against learnerLevel.
{
  const result = analyze("我喜欢吃苹果。他讨厌喝咖啡！", 2);
  assert.equal(result.sentences.length, 2);
  const flaggedWords = result.sentences.flatMap((s) => s.words.filter((w) => w.flagged));
  assert.ok(flaggedWords.length > 0, "expected at least one flagged (OOV or above-level) word");
}

// hashString(): the gloss cache key is (word, sentenceHash) — must be
// deterministic and distinguish different sentences.
{
  assert.equal(hashString("你好"), hashString("你好"));
  assert.notEqual(hashString("你好吗"), hashString("你好"));
}

// Anki import: quoted fields may hold tabs, newlines and "" escapes; multi-line
// notes must stay one note (a naive line split would count them as several).
{
  const raw = [
    "#separator:tab",
    "#html:true",
    "围巾\twéijīn<br>Scarf\t",
    '具体流程\t"jùtǐ<br>Note: ""具体"" = details\nsecond line"\t',
    "优惠 / 会员\tyōuhuì / huìyuán<br>Discount / Member\t",
    "淘宝 / 淘宝网\ttáobǎo\t",
    "又…又…\tyòu… yòu…\t",
    "打车\tPinyin: dǎ chē<br>Jyutping: daa2 ce1\t",
    "计划\tPinyin: jì huà<br>Patterns:<br>- 制定 + 计划\t",
  ].join("\n");
  const deck = parseAnkiExport(raw);
  assert.equal(deck.headers.separator, "tab");
  assert.equal(deck.notes.length, 7);
  assert.equal(deck.notes[1].backText.includes('Note: "具体" = details\nsecond line'), true);
  assert.equal(deck.notes[2].splitKind, "pair"); // different words -> split
  assert.deepEqual(deck.notes[2].frontParts, ["优惠", "会员"]);
  assert.equal(deck.notes[3].splitKind, "variant"); // 淘宝网 contains 淘宝 -> keep together
  assert.equal(deck.notes[4].isGrammar, true);
  assert.equal(deck.notes[0].isGrammar, false);
  assert.deepEqual(
    deck.notes.map((n) => n.format),
    ["old", "old", "old", "old", "old", "intermediate", "current"],
  );
}

// planSplit(): the official list decides; heuristics are only proposals.
{
  const index = {
    entries: { A: ["1", "N"], B: ["2", "V"], C: ["2", "V"], D: ["4", "V"] },
    forms: { "爸爸": ["A"], "爸": ["A"], "选": ["B"], "选择": ["D"], "租": ["B"], "出租": ["C"] },
  };
  const p = (f) => planSplit(f, index);
  assert.deepEqual([p("爸爸 / 爸").action, p("爸爸 / 爸").status], ["keep", "official"]);
  assert.deepEqual([p("选 / 选择").action, p("选 / 选择").status], ["split", "official"]); // different rows
  assert.deepEqual([p("租 / 出租").action, p("租 / 出租").status], ["split", "official"]); // same level+POS, still two ids
  assert.deepEqual([p("淘宝 / 淘宝网").action, p("淘宝 / 淘宝网").status], ["keep", "proposal"]);
  assert.deepEqual([p("京东网 / 天猫网").action, p("京东网 / 天猫网").status], ["split", "proposal"]);
  assert.equal(p("爸 / 淘宝").status, "proposal"); // only one part is listed
  assert.deepEqual([p("之 / ……分之……").action, p("之 / ……分之……").status], ["split", "proposal"]); // word + pattern
  assert.equal(p("打车").action, "none");
}

// buildDeckPlan(): official splits apply; proposals follow overrides.
{
  const index = { entries: { A: ["2", "N"], B: ["3", "N"] }, forms: { "优惠": ["A"], "会员": ["B"] } };
  const TAB = String.fromCharCode(9);
  const NL = String.fromCharCode(10);
  const deck = parseAnkiExport(
    [`优惠 / 会员${TAB}x${TAB}`, `淘宝 / 淘宝网${TAB}y${TAB}`, `又…又…${TAB}z${TAB}`].join(NL),
  );
  const plan = buildDeckPlan(deck, index);
  assert.deepEqual(plan.units.map((u) => u.front), ["优惠", "会员", "淘宝 / 淘宝网", "又…又…"]);
  assert.equal(plan.units[0].splitFrom, "优惠 / 会员");
  assert.equal(plan.units[3].type, "grammar");
  assert.deepEqual(plan.units[2].forms, ["淘宝", "淘宝网"]); // variants all count as known
  const split = buildDeckPlan(deck, index, new Map([[2, "split"]]));
  assert.deepEqual(split.units.map((u) => u.front).slice(2, 4), ["淘宝", "淘宝网"]);
  const forced = buildDeckPlan(deck, index, new Map([[1, "keep"]])); // official split can't be overridden
  assert.equal(forced.units[0].front, "优惠");
  assert.equal(plan.known.length, 5);
}

// buildCardPrompt()/cleanCardOutput(): the prompt carries only the fields given;
// output loses a wrapping code fence but keeps inner content intact.
{
  assert.equal(buildCardPrompt({ item: "打车", type: "word" }), ["item: 打车", "type: word"].join(String.fromCharCode(10)));
  const full = buildCardPrompt({ item: "下单", type: "word", context: "我下单了", hsk: "3", oldBack: "xiàdān" });
  assert.ok(full.includes("context: 我下单了") && full.includes("hsk: 3") && full.endsWith("xiàdān"));
  const NL = String.fromCharCode(10);
  assert.equal(cleanCardOutput("```" + NL + "Pinyin: dǎ chē" + NL + "```"), "Pinyin: dǎ chē");
  assert.equal(cleanCardOutput("  Pinyin: dǎ chē  "), "Pinyin: dǎ chē");
}

// hasAccess(): exact match on the x-access-code header; wrong or missing fails.
{
  const req = (code) => new Request("http://x/api/card", { headers: code ? { "x-access-code": code } : {} });
  assert.equal(hasAccess(req("secret"), "secret"), true);
  assert.equal(hasAccess(req("secreX"), "secret"), false);
  assert.equal(hasAccess(req("secret!"), "secret"), false); // different length
  assert.equal(hasAccess(req(), "secret"), false);
}

// checkCardFormat(): a complete card passes; missing labels, fences and markdown are reported.
{
  const NL = String.fromCharCode(10);
  const word = [
    "Pinyin: dǎ chē", "Jyutping: daa2 ce1", "Used in Cantonese: No", "Part of speech: Verb",
    "Register: Informal", "Translation: to take a taxi", "Patterns:", "- 打车 + 去 + 地点 (take a taxi to a place)",
    "Example: 我们打车去机场吧。", "Wǒmen dǎchē qù jīchǎng ba.", "Let's take a taxi to the airport.",
  ].join(NL);
  assert.deepEqual(checkCardFormat(word, "word"), { ok: true, problems: [] });
  const broken = checkCardFormat(word.replace("Jyutping: daa2 ce1" + NL, ""), "word");
  assert.deepEqual(broken.problems, ["missing Jyutping:"]);
  assert.ok(checkCardFormat("**Pinyin:** x", "word").problems.includes("contains markdown"));
  const gaveUp = checkCardFormat(word.replace("Translation: to take a taxi", "Translation: unsure"), "word");
  assert.deepEqual(gaveUp.problems, ["Translation: is unsure"]);
  const grammar = checkCardFormat(word, "grammar");
  assert.ok(grammar.problems.includes("missing Pattern:") && grammar.problems.includes("grammar card needs two Example lines"));
}

// parseReasoning(): off disables, levels set effort, anything else leaves the default.
{
  assert.deepEqual(parseReasoning("off"), { enabled: false });
  assert.deepEqual(parseReasoning(" Low "), { effort: "low" });
  assert.equal(parseReasoning(""), undefined);
  assert.equal(parseReasoning(undefined), undefined);
  assert.equal(parseReasoning("max"), undefined);
}

// generateValidCard(): retries once on an unusable card, then reports the problems.
{
  const NL = String.fromCharCode(10);
  const good = ["Pinyin: a", "Jyutping: b", "Used in Cantonese: No", "Part of speech: Verb", "Register: Neutral", "Translation: t", "Patterns:", "- p", "    s", "    py", "    tr", "Example: e"].join(NL);
  const bad = good.replace("Translation: t", "Translation: unsure");
  const seq = (...outs) => { let i = 0; return { generateCard: async () => outs[Math.min(i++, outs.length - 1)] }; };
  const req = { item: "x", type: "word" };
  assert.deepEqual(await generateValidCard(seq(bad, good), req, "spec"), { ok: true, back: good });
  const failed = await generateValidCard(seq(bad), req, "spec");
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.problems, ["Translation: is unsure"]);
  const bare = good.replace(["    s", "    py", "    tr", ""].join(NL), "");
  const noExample = await generateValidCard(seq(bare), req, "spec");
  assert.equal(noExample.ok, false);
  assert.ok(noExample.problems.some((p) => p.includes("needs an example")), "a pattern without an example is retried, then reported");
}

// splitChanged()/buildAnkiTsv(): the review note is stripped; the export parses back to the same cards.
{
  const NL = String.fromCharCode(10);
  assert.deepEqual(splitChanged(["Pinyin: a", "Example: e", "Changed: fixed the pinyin"].join(NL)), { back: ["Pinyin: a", "Example: e"].join(NL), changed: "fixed the pinyin" });
  assert.deepEqual(splitChanged("Pinyin: a"), { back: "Pinyin: a" });
  const back = ["Pinyin: guótǔ", 'Example: 他说"好" & 走了', "Translation: a < b"].join(NL);
  const out = buildAnkiTsv([
    { front: "国土", back, type: "word", tags: "" },
    { front: "又…又…", back: "Pattern: x", type: "grammar", tags: "old" },
    { front: "国土", back: "dup", type: "word", tags: "" },
  ]);
  assert.equal(out.count, 2);
  assert.deepEqual(out.skippedDuplicates, ["国土"]);
  const parsed = parseAnkiExport(out.tsv);
  assert.deepEqual(parsed.notes.map((n) => n.front), ["国土", "又…又…"]);
  assert.equal(parsed.notes[0].backText, back);
  assert.equal(parsed.notes[1].tags, "old grammar");
}

// mergeDeck(): new notes are added, rewrites survive, changed sources are flagged, vanished notes marked.
{
  const rec = (id, front, oldBack, status, extra = {}) => ({
    id, front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: id, status, createdAt: 0, ...extra,
  });
  const unit = (front, oldBack, extra = {}) => ({ front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: 1, ...extra });
  const existing = [
    rec(1, "A", "a", "approved", { newBack: "new a" }),
    rec(2, "B", "b", "approved", { newBack: "new b" }),
    rec(3, "C", "c", "pending"),
    rec(4, "D", "d", "generated", { newBack: "new d" }),
    rec(5, "E", "e", "skipped", { missing: true }),
    rec(6, "F", "f1", "pending"),
    rec(7, "F", "f2", "pending"),
  ];
  const incoming = [
    unit("A", "a"), // unchanged
    unit("B", "b edited"), // rewritten, source changed -> stale
    unit("C", "c edited"), // pending, source changed -> just updated
    unit("NEW", "n"), // added
    unit("E", "e"), // back again -> missing cleared
    unit("F", "f1"),
    unit("F", "f2"), // duplicate fronts match by occurrence
  ];
  const r = mergeDeck(existing, incoming);
  assert.deepEqual(r.addedFronts, ["NEW"]);
  assert.deepEqual(r.changedFronts, ["B", "C"]);
  assert.deepEqual(r.staleFronts, ["B"]);
  assert.deepEqual(r.missingFronts, ["D"]);
  assert.equal(r.unchanged, 4); // A, E, F, F
  const byId = Object.fromEntries(r.update.map((u) => [u.id, u.changes]));
  assert.equal(byId[2].stale, true);
  assert.equal(byId[2].oldBack, "b edited");
  assert.equal("stale" in byId[3], false); // pending cards aren't marked stale
  assert.equal(byId[4].missing, true);
  assert.equal(byId[5].missing, false);
  assert.equal(1 in byId, false); // untouched
}

// serializeBackup()/parseBackup(): round-trips, and rejects files that aren't a valid backup.
{
  const tables = {
    deck_units: [{ id: 1, front: "国土", oldBack: "x", status: "approved", newBack: "y", extra: [1] }],
    known: [{ key: "word:国土", item: "国土", type: "word" }],
    texts: [],
    cards: [],
    reviews: [],
    new_cards: [{ id: 1, front: "苹果", status: "approved" }],
  };
  const text = serializeBackup(tables, new Date("2026-10-09T00:00:00Z"));
  const back = parseBackup(text);
  assert.deepEqual(back.tables, tables);
  assert.equal(back.exportedAt, "2026-10-09T00:00:00.000Z");
  // a backup made before new_cards existed still restores, with an empty table
  const { new_cards: _omit, ...older } = tables;
  assert.deepEqual(parseBackup(JSON.stringify({ app: "hanzisave", version: 1, exportedAt: "x", tables: older })).tables.new_cards, []);
  for (const status of ["in_format", "confirmed"]) {
    const ok = { ...JSON.parse(text), tables: { ...tables, deck_units: [{ front: "a", oldBack: "b", status }] } };
    assert.equal(parseBackup(JSON.stringify(ok)).tables.deck_units[0].status, status);
  }
  assert.throws(() => parseBackup("not json"), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ app: "other" })), /Not a HanziSave backup/);
  const badStatus = { ...JSON.parse(text), tables: { ...tables, deck_units: [{ front: "a", oldBack: "b", status: "weird" }] } };
  assert.throws(() => parseBackup(JSON.stringify(badStatus)), /deck_units/);
}

// readApkg(): reads notes (with their Anki ids) from modern and legacy packages; rejects non-packages.
{
  const dir = mkdtempSync(join(tmpdir(), "hanzisave-test-"));
  try {
    const file = join(dir, "c.sqlite");
    const db = new DatabaseSync(file);
    db.exec("create table notes (id integer primary key, guid text, flds text, tags text)");
    const US = String.fromCharCode(31);
    const add = db.prepare("insert into notes (id, guid, flds, tags) values (?, ?, ?, ?)");
    add.run(1663522866647, "g1", ["国土", "guótǔ<br>territory"].join(US), " grammar ");
    add.run(1663522866648, "g2", ["直接", "zhíjiē"].join(US), "");
    db.close();
    const sqliteBytes = new Uint8Array(readFile(file));

    const modern = zipSync({ "collection.anki21b": zstdCompressSync(sqliteBytes), media: strToU8("{}"), meta: strToU8("x") });
    const legacy = zipSync({ "collection.anki2": sqliteBytes });
    for (const pkg of [modern, legacy]) {
      const notes = readApkg(pkg);
      assert.equal(notes.length, 2);
      assert.deepEqual(notes[0], { noteId: 1663522866647, guid: "g1", fields: ["国土", "guótǔ<br>territory"], tags: "grammar" });
      assert.equal(notes[1].noteId, 1663522866648);
    }
    assert.throws(() => readApkg(zipSync({ media: strToU8("{}") })), /no collection/);
    assert.throws(() => readApkg(strToU8("not a zip")), /Not an Anki package/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// mergeDeck() with Anki ids: exact pairing survives swapped duplicates and edited fronts; id-less cards adopt ids.
{
  const rec = (id, front, oldBack, status, extra = {}) => ({
    id, front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: id, status, createdAt: 0, ...extra,
  });
  const unit = (front, oldBack, extra = {}) => ({ front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: 1, ...extra });
  const existing = [
    rec(1, "F", "first", "approved", { newBack: "n1", ankiNoteId: 10 }),
    rec(2, "F", "second", "approved", { newBack: "n2", ankiNoteId: 11 }),
    rec(3, "G", "g", "approved", { newBack: "n3", ankiNoteId: 20 }),
    rec(4, "H", "h", "pending"), // imported from text, no id yet
  ];
  const incoming = [
    unit("F", "second", { ankiNoteId: 11 }), // duplicate fronts listed in the other order
    unit("F", "first", { ankiNoteId: 10 }),
    unit("G2", "g", { ankiNoteId: 20 }), // front edited in Anki
    unit("H", "h", { ankiNoteId: 30 }), // matched by front, adopts the id
  ];
  const r = mergeDeck(existing, incoming);
  const byId = Object.fromEntries(r.update.map((u) => [u.id, u.changes]));
  assert.deepEqual(r.addedFronts, []);
  assert.deepEqual(r.missingFronts, []);
  assert.equal(1 in byId && "stale" in byId[1], false); // right history stays with the right card
  assert.equal(2 in byId && "stale" in byId[2], false);
  assert.deepEqual([byId[3].front, byId[3].stale], ["G2", true]); // renamed -> stale, still the same card
  assert.equal(byId[4].ankiNoteId, 30);
  assert.deepEqual(r.staleFronts, ["G2"]);

  // split parts share a note id but stay distinct cards
  const parts = [rec(5, "优惠", "x", "pending", { ankiNoteId: 40, splitFrom: "优惠 / 会员" }), rec(6, "会员", "x", "pending", { ankiNoteId: 40, splitFrom: "优惠 / 会员" })];
  const same = mergeDeck(parts, [unit("优惠", "x", { ankiNoteId: 40, splitFrom: "优惠 / 会员" }), unit("会员", "x", { ankiNoteId: 40, splitFrom: "优惠 / 会员" })]);
  assert.equal(same.add.length, 0);
  assert.equal(same.unchanged, 2);
}

// notesFromApkg(): ids and cleaned text carry through to the parsed deck.
{
  const deck = notesFromApkg([{ noteId: 7, guid: "g", fields: ["<div>国土</div>", "guótǔ<br>territory"], tags: " x " }, { noteId: 8, guid: "h", fields: ["", "empty"], tags: "" }]);
  assert.equal(deck.notes.length, 1);
  assert.equal(deck.skipped, 1);
  assert.deepEqual([deck.notes[0].front, deck.notes[0].ankiNoteId, deck.notes[0].ankiGuid, deck.notes[0].tags], ["国土", 7, "g", "x"]);
  const plan = buildDeckPlan(deck, { entries: {}, forms: {} });
  assert.equal(plan.units[0].ankiNoteId, 7);
}

// mergeDeck(): id-less duplicates adopt the right ids even when the export lists them in another order.
{
  const rec = (id, front, oldBack) => ({ id, front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: id, status: "pending", createdAt: 0 });
  const unit = (front, oldBack, ankiNoteId) => ({ front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: 1, ankiNoteId });
  const r = mergeDeck([rec(1, "F", "first"), rec(2, "F", "second")], [unit("F", "second", 11), unit("F", "first", 10)]);
  const byId = Object.fromEntries(r.update.map((u) => [u.id, u.changes]));
  assert.equal(byId[1].ankiNoteId, 10);
  assert.equal(byId[2].ankiNoteId, 11);
  assert.equal(r.changedFronts.length, 0);
}

// segment() with extra words: the learner's own vocabulary stays whole, levels still come from the lexicon.
{
  const plain = segment("叶公好龙的故事").map((w) => w.surface);
  const withExtra = segment("叶公好龙的故事", { extra: new Set(["叶公好龙"]) });
  assert.ok(plain.length >= 1);
  assert.ok(withExtra.some((w) => w.surface === "叶公好龙"), "extra word should be kept whole");
  assert.equal(withExtra.find((w) => w.surface === "叶公好龙").level, null);
  const dianNao = segment("电脑很贵", { extra: new Set(["电脑"]) }).find((w) => w.surface === "电脑");
  assert.equal(dianNao.level, 1); // lexicon level is kept for words that are also in the lexicon
}

// scanText(): known words and words at or below the level floor are skipped; counts and context are kept.
{
  const text = "叶公好龙是一个故事。电脑很贵，苹果也很贵。我喜欢苹果。";
  const names = (r) => r.newWords.map((w) => w.surface);

  const none = scanText(text, { known: new Set() });
  assert.ok(names(none).includes("电脑"));
  assert.equal(none.newWords.find((w) => w.surface === "电脑").level, 1);

  const apple = none.newWords.find((w) => w.surface === "苹果");
  assert.equal(apple.count, 2);
  assert.equal(apple.sentence, "电脑很贵，苹果也很贵。"); // first sentence it appears in

  const withKnown = scanText(text, { known: new Set(["叶公好龙", "电脑"]) });
  assert.ok(!names(withKnown).includes("叶公好龙"), "the learner's own word is known, even if the lexicon lacks it");
  assert.ok(!names(withKnown).includes("电脑"));
  assert.ok(withKnown.knownWords > none.knownWords);

  const floored = scanText(text, { known: new Set(), levelFloor: 1 });
  assert.ok(!names(floored).includes("电脑"), "HSK 1 words are hidden with a floor of 1");
  assert.ok(names(floored).length > 0, "words above the floor, or outside the HSK list, remain");
  assert.ok(!names(scanText("hello 123 。", { known: new Set() })).length, "non-Han text yields no words");
}

// scanText(): tokens that are just easy known pieces joined are not new words; idioms still are.
{
  const names = (r) => r.newWords.map((w) => w.surface);
  const text = "他三天后到了。叶公好龙是个故事。";
  assert.ok(names(scanText(text, { known: new Set(), levelFloor: 0 })).includes("三天"), "without a floor, 三天 is still reported");
  const floored = scanText(text, { known: new Set(), levelFloor: 2 });
  assert.ok(!names(floored).includes("三天"), "三 + 天 are both easy, so 三天 is not new");
  assert.ok(!names(floored).includes("到了"));
  const viaKnown = scanText("他买了网购。", { known: new Set(["网", "购"]), levelFloor: 0 });
  assert.ok(!names(viaKnown).includes("网购"), "pieces the learner already has make the compound known");
  assert.ok(names(scanText("他背得滚瓜烂熟。", { known: new Set(["滚", "瓜", "烂", "熟"]), levelFloor: 6 })).includes("滚瓜烂熟"), "four-character idioms are never waved through");
}

// mergeDeck(): an approved rewrite that comes back from Anki unchanged is not an edit and not stale.
{
  const rec = (id, front, oldBack, status, extra = {}) => ({
    id, front, forms: [front], type: "word", format: "old", oldBack, tags: "", sourceRow: id, status, createdAt: 0, ...extra,
  });
  const unit = (front, oldBack) => ({ front, forms: [front], type: "word", format: "current", oldBack, tags: "", sourceRow: 1 });
  const existing = [
    rec(1, "A", "old a", "approved", { newBack: "NEW A" }),
    rec(2, "B", "old b", "approved", { newBack: "NEW B" }),
  ];
  const trailing = "NEW A" + String.fromCharCode(10); // exports can add a trailing newline
  const r = mergeDeck(existing, [unit("A", trailing), unit("B", "NEW B edited in Anki")]);
  const byId = Object.fromEntries(r.update.map((u) => [u.id, u.changes]));
  assert.deepEqual(r.importedFronts, ["A"]);
  assert.equal("stale" in byId[1], false);
  assert.equal(byId[1].oldBack, trailing);
  assert.equal(byId[1].format, "current");
  assert.deepEqual(r.staleFronts, ["B"]); // a genuine edit after the rewrite still flags it
  assert.equal(r.unchanged, 1);
}

// estimateRemainingMs()/formatEta(): the estimate follows the pace so far and reads naturally.
{
  assert.equal(estimateRemainingMs(0, 5000, 0, 10), null, "no estimate before the first completion");
  assert.equal(estimateRemainingMs(0, 5000, 10, 10), null, "no estimate once finished");
  assert.equal(estimateRemainingMs(0, 10_000, 5, 15), 20_000); // 2 s per card, 10 cards left
  assert.equal(etaTracker(10)(0), null, "the tracker gives no estimate before anything is done");
  assert.equal(etaTracker(10)(10), null);
  assert.equal(formatEta(400), "~1 s left");
  assert.equal(formatEta(45_000), "~45 s left");
  assert.equal(formatEta(4 * 60_000), "~4 min left");
  assert.equal(formatEta(75 * 60_000), "~1 h 15 min left");
}

// splitComponents()/planComponentCards(): phrases split into parts; duplicates and lone characters never become cards.
{
  assert.deepEqual(splitComponents("注册银行卡", new Set()), ["注册", "银行卡"]);
  // a phrase the learner already has must still be split
  assert.deepEqual(splitComponents("注册银行卡", new Set(["注册银行卡"])), ["注册", "银行卡"]);
  assert.deepEqual(splitComponents("银行", new Set()), [], "a single word is not a phrase");
  assert.deepEqual(splitComponents("绑定银行卡", new Set()), ["绑定", "银行卡"], "characters the segmenter split are joined back");
  assert.ok(splitComponents("快递员", new Set()).every((p) => p.length >= 2), "single characters are dropped");

  const plan = planComponentCards(["注册银行卡", "注册账号"], new Set(["银行卡"]));
  const fronts = plan.add.map((a) => a.front);
  assert.ok(fronts.includes("注册"), "注册 is new");
  assert.equal(fronts.filter((f) => f === "注册").length, 1, "added once even though two phrases contain it");
  assert.ok(!fronts.includes("银行卡"), "银行卡 already exists");
  assert.ok(plan.skipped.includes("银行卡"));
  assert.equal(plan.add.find((a) => a.front === "注册").componentOf, "注册银行卡");
  assert.deepEqual(planComponentCards(["银行"], new Set()).withoutParts, ["银行"]);

  // only plain, short expressions are split
  const odd = planComponentCards(["现场〔現場〕", "好 (as in 好久)", "不到长城非好汉"], new Set());
  assert.equal(odd.add.length, 0);
  assert.equal(odd.withoutParts.length, 3);

  // parts that are not known words are left out and reported, not turned into cards
  const real = new Set(["眼神", "接触"]);
  const strict = planComponentCards(["眼神接触", "任重道远"], new Set(), (w) => real.has(w));
  assert.deepEqual(strict.add.map((a) => a.front), ["眼神", "接触"]);
  assert.ok(strict.unverified.length > 0, "fragments of the idiom are reported as left out");
  assert.ok(strict.add.every((a) => a.componentOf === "眼神接触"));
}

// mergeDeck(): cards made here (components) aren't "missing" before they reach Anki.
{
  const rec = (id, front, extra = {}) => ({ id, front, forms: [front], type: "word", format: "old", oldBack: "", tags: "", sourceRow: 0, status: "approved", createdAt: 0, ...extra });
  const r = mergeDeck([rec(1, "注册", { componentOf: "注册银行卡" }), rec(2, "旧词")], []);
  assert.deepEqual(r.missingFronts, ["旧词"]);
}

// addPatternPinyin(): pattern lines gain bracketed pinyin; nothing else changes; running twice is a no-op.
{
  const NL = String.fromCharCode(10);
  const fake = (run) => "<" + run + ">";
  const card = [
    "Pinyin: jì huà",
    "Part of speech: Noun",
    "Patterns:",
    "- 制定/做 + 计划 (make a plan)",
    "- V + 得 + Adj (verb complement)",
    "- A + B (no hanzi at all)",
    "Example: 我们的旅行计划变了。",
    "",
    "Part of speech: Verb",
    "Patterns:",
    "- 计划 + V",
    "Example: 他们正在计划婚礼。",
  ].join(NL);
  const out = addPatternPinyin(card, fake).split(NL);
  assert.equal(out[3], "- 制定/做 + 计划 [<制定>/<做> + <计划>] (make a plan)");
  assert.equal(out[4], "- V + 得 + Adj [V + de + Adj] (verb complement)", "a lone particle takes its grammatical reading");
  assert.equal(out[5], "- A + B (no hanzi at all)", "lines without hanzi are untouched");
  assert.equal(out[6], "Example: 我们的旅行计划变了。", "other lines are untouched");
  assert.equal(out[10], "- 计划 + V [<计划> + V]", "a second Patterns section is handled, and a line with no gloss works");
  assert.equal(out.length, card.split(NL).length);
  assert.equal(addPatternPinyin(addPatternPinyin(card, fake), fake), addPatternPinyin(card, fake), "idempotent");

  // with the real converter: context decides the reading (行 in 银行卡 is háng)
  const real = await withPatternPinyin(["Patterns:", "- 打车 + 去 + 地点 (take a taxi)", "- 绑定 + 银行卡 (link a bank card)"].join(NL));
  assert.equal(real.split(NL)[1], "- 打车 + 去 + 地点 [dǎchē + qù + dìdiǎn] (take a taxi)");
  assert.equal(real.split(NL)[2], "- 绑定 + 银行卡 [bǎngdìng + yínhángkǎ] (link a bank card)");
  // several words in one run are spaced like words elsewhere on the card
  const multi = await withPatternPinyin(["Patterns:", "- 做某事 + 很热闹 (x)", "- 用语言 + 表达 (y)"].join(NL));
  assert.equal(multi.split(NL)[1], "- 做某事 + 很热闹 [zuò mǒushì + hěn rènào] (x)");
  assert.equal(multi.split(NL)[2], "- 用语言 + 表达 [yòng yǔyán + biǎodá] (y)");
}

// Pattern examples: each pattern carries an indented example, pinyin and translation; "Patterns: -" needs none.
{
  const NL = String.fromCharCode(10);
  const withExamples = [
    "Patterns:",
    "- 打车 + 去 + 地点 (take a taxi to a place)",
    "    我打车去机场。",
    "    Wǒ dǎchē qù jīchǎng.",
    "    I took a taxi to the airport.",
    "- 打车 + 回家 (take a taxi home)",
    "    太晚了，我们打车回家吧。",
    "    Tài wǎn le, wǒmen dǎchē huíjiā ba.",
    "    It is late, let's take a taxi home.",
    "Example: 我打车去机场。",
  ].join(NL);
  assert.deepEqual(checkPatternExamples(withExamples), []);
  assert.deepEqual(checkPatternExamples(["Translation: cat", "Patterns: -", "Example: 我有一只猫。"].join(NL)), [], "no patterns is fine");
  const missing = checkPatternExamples(withExamples.replace(/    太晚了.*\n.*\n.*\n/, ""));
  assert.equal(missing.length, 1);
  assert.ok(missing[0].includes("打车 + 回家"), "names the pattern that has no example");
  assert.equal(checkPatternExamples("Patterns:" + NL + "- 打车 + 去 + 地点 (x)" + NL + "Example: e").length, 1, "a bare pattern line is rejected");

  // the pinyin step adds brackets to pattern lines only; the indented lines stay as they are
  const fake = (run) => "<" + run + ">";
  const out = addPatternPinyin(withExamples, fake).split(NL);
  assert.equal(out[1], "- 打车 + 去 + 地点 [<打车> + <去> + <地点>] (take a taxi to a place)");
  assert.equal(out[2], "    我打车去机场。");
  assert.equal(out[5], "- 打车 + 回家 [<打车> + <回家>] (take a taxi home)", "a pattern after an example still gets pinyin");
  assert.equal(out[9], "Example: 我打车去机场。");

  // indentation survives the Anki export
  assert.equal(toHtmlField("- a" + NL + "    b"), "- a<br>&nbsp;&nbsp;&nbsp;&nbsp;b");
}

// Gloss: plain JSON from the model is parsed and checked; prose around it is tolerated; junk is rejected.
{
  const json = '{"pinyin":"diànnǎo","gloss":"computer","example":"我的电脑坏了。","examplePinyin":"Wǒ de diànnǎo huài le.","exampleTranslation":"My computer broke."}';
  assert.equal(parseGloss(json).gloss, "computer");
  assert.equal(parseGloss("Here you go:\n```json\n" + json + "\n```").pinyin, "diànnǎo", "a code fence and prose around the JSON are fine");
  assert.equal(parseGloss('{"pinyin":"a","gloss":"b","example":"c"}').examplePinyin, undefined, "older replies without the extra fields still parse");
  assert.equal(parseGloss('{"pinyin":"a"}'), null, "missing fields");
  assert.equal(parseGloss("sorry, I cannot"), null);

  // the provider retries once, then reports an unusable gloss; the model and reasoning come from the card settings
  const calls = [];
  const fake = (...replies) => ({ chat: { completions: { create: async (p) => { calls.push(p); return { choices: [{ message: { content: replies[Math.min(calls.length - 1, replies.length - 1)] } }] }; } } } });
  const ok = await createOpenAiProvider(fake("not json", json), "qwen/test", undefined).generateGloss({ word: "电脑", sentence: "我的电脑坏了。" });
  assert.equal(ok.gloss, "computer");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, "qwen/test");
  calls.length = 0;
  await assert.rejects(createOpenAiProvider(fake("nope"), "qwen/test", undefined).generateGloss({ word: "电脑", sentence: "s" }), /unusable gloss/);
  assert.equal(calls.length, 2);
}

// markText(): the reading view marks exactly the words scanText reports as new, and leaves punctuation alone.
{
  const text = "我们明天去开会。他喜欢点外卖，而且不爱做饭！";
  for (const opts of [{ known: new Set() }, { known: new Set(["开会"]), levelFloor: 2 }, { known: new Set(["开会"]), levelFloor: 6 }]) {
    const marked = markText(text, opts);
    assert.equal(marked.map((s) => s.text).join(""), text, "every character is kept, in order");
    assert.equal(marked.flatMap((s) => s.words).map((w) => w.surface).join(""), text.replace(/\s/g, ""));
    const newFromMarks = [...new Set(marked.flatMap((s) => s.words).filter((w) => w.status === "new").map((w) => w.surface))];
    assert.deepEqual(newFromMarks, scanText(text, opts).newWords.map((w) => w.surface), "same words as the new-word list");
    assert.ok(marked.flatMap((s) => s.words).filter((w) => /[。，！]/.test(w.surface)).every((w) => w.status === "other"));
  }
  assert.ok(markText("开会", { known: new Set(["开会"]) })[0].words.every((w) => w.status === "known"));
}

console.log("smoke-test: all checks passed");

import { db } from "./db";
import { withPatternPinyin } from "./pattern-pinyin";

// Adds pinyin to the patterns of every card already generated, in the rewrite list and in
// cards made from scans. Cards that already have it are left as they are, so it is safe to
// run more than once.
export async function addPinyinToExistingCards(): Promise<{ checked: number; updated: number }> {
  let checked = 0;
  let updated = 0;

  for (const unit of await db.deck_units.toArray()) {
    if (!unit.newBack) continue;
    checked++;
    const next = await withPatternPinyin(unit.newBack);
    if (next !== unit.newBack) {
      await db.deck_units.update(unit.id!, { newBack: next });
      updated++;
    }
  }

  for (const card of await db.new_cards.toArray()) {
    if (!card.back) continue;
    checked++;
    const next = await withPatternPinyin(card.back);
    if (next !== card.back) {
      await db.new_cards.update(card.id!, { back: next });
      updated++;
    }
  }

  return { checked, updated };
}

from __future__ import annotations

from collections.abc import Iterator

from datasets import load_dataset
from opencc import OpenCC

from .segment import cjk_ratio, split_sentences

WIKI_CONFIG = "20231101.zh"


def iter_wikipedia_sentences(
    max_sentences: int,
    min_len: int = 6,
    max_len: int = 60,
    min_cjk: float = 0.8,
    max_per_article: int = 10,
    seed: int = 0,
) -> Iterator[dict]:
    ds = load_dataset("wikimedia/wikipedia", WIKI_CONFIG, split="train", streaming=True)
    ds = ds.shuffle(seed=seed, buffer_size=10_000)
    t2s = OpenCC("t2s")
    seen: set[str] = set()
    n = 0
    for article in ds:
        text = t2s.convert(article["text"])
        taken = 0
        for sentence in split_sentences(text):
            if taken >= max_per_article:
                break
            if not (min_len <= len(sentence) <= max_len):
                continue
            if cjk_ratio(sentence) < min_cjk or sentence in seen:
                continue
            seen.add(sentence)
            yield {"article_id": article["id"], "title": article["title"], "sentence": sentence}
            n += 1
            taken += 1
            if n >= max_sentences:
                return

from __future__ import annotations

import csv
import re
from pathlib import Path

import jieba

from .paths import LEXICON_CSV

OOV = 0

_ANNOTATION = re.compile(r"[（(][^（()）]*[)）]")
_STRIP = re.compile(r"[¹²³…]")
_VARIANT_SEP = re.compile(r"[｜|]")


def normalize_entry(raw: str) -> list[str]:
    """'爸爸｜爸' -> ['爸爸', '爸'];  '称¹（动）' -> ['称'];  '…极了' -> ['极了']"""
    cleaned = _STRIP.sub("", _ANNOTATION.sub("", raw))
    return [v.strip() for v in _VARIANT_SEP.split(cleaned) if v.strip()]


class Lexicon:
    def __init__(self, word_levels: dict[str, int]):
        self.word_levels = word_levels
        # Registering every HSK word as a jieba user-dict entry makes multi-character
        # words segment as single tokens, which directly raises lexicon coverage.
        for word in word_levels:
            jieba.add_word(word)

    @classmethod
    def load(cls, path: Path = LEXICON_CSV) -> "Lexicon":
        levels: dict[str, int] = {}
        with open(path, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                level = int(row["hsk_level"])
                for word in normalize_entry(row["chinese"]):
                    if word not in levels or level < levels[word]:
                        levels[word] = level
        return cls(levels)

    def level(self, word: str) -> int:
        return self.word_levels.get(word, OOV)

    def __len__(self) -> int:
        return len(self.word_levels)

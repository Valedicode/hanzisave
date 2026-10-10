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

    def split_oov(self, token: str) -> list[str] | None:
        """Greedy longest-match split of an OOV token into known lexicon words.

        jieba sometimes merges two known words into one unknown token
        (e.g. '工作效率' -> ['工作', '效率'] would both be known). Returns
        the sub-words if the whole token is covered, else None.
        """
        out, i, n = [], 0, len(token)
        while i < n:
            for j in range(n, i, -1):
                if token[i:j] in self.word_levels:
                    out.append(token[i:j])
                    i = j
                    break
            else:
                return None
        return out

    def __len__(self) -> int:
        return len(self.word_levels)

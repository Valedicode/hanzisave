from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean

from .lexicon import OOV, Lexicon
from .segment import tokenize

RULES = ("max", "supported_max", "p90")


@dataclass
class SentenceStats:
    n_words: int
    levels: list[int]
    oov_words: list[str] = field(default_factory=list)

    @property
    def n_known(self) -> int:
        return len(self.levels)

    @property
    def coverage(self) -> float:
        return self.n_known / self.n_words if self.n_words else 0.0

    @property
    def max_level(self) -> int:
        return max(self.levels, default=OOV)

    @property
    def mean_level(self) -> float:
        return mean(self.levels) if self.levels else 0.0

    def p90_level(self) -> int:
        if not self.levels:
            return OOV
        s = sorted(self.levels)
        return s[min(len(s) - 1, int(0.9 * (len(s) - 1)))]

    def supported_max(self, min_support: int = 2) -> int:
        counts = {}
        for lv in self.levels:
            counts[lv] = counts.get(lv, 0) + 1
        supported = [lv for lv, n in counts.items() if n >= min_support]
        return max(supported) if supported else self.p90_level()


def score(sentence: str, lexicon: Lexicon) -> SentenceStats:
    tokens = tokenize(sentence)
    levels, oov = [], []
    n_words = 0
    for t in tokens:
        lv = lexicon.level(t)
        if lv != OOV:
            levels.append(lv)
            n_words += 1
            continue
        sub_words = lexicon.split_oov(t)
        if sub_words is None:
            oov.append(t)
            n_words += 1
        else:
            levels.extend(lexicon.level(w) for w in sub_words)
            n_words += len(sub_words)
    return SentenceStats(n_words=n_words, levels=levels, oov_words=oov)


def label(stats: SentenceStats, rule: str = "max", min_support: int = 2) -> int:
    if rule == "max":
        return stats.max_level
    if rule == "p90":
        return stats.p90_level()
    if rule == "supported_max":
        return stats.supported_max(min_support)
    raise ValueError(f"unknown rule {rule!r}; expected one of {RULES}")

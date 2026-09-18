from __future__ import annotations

import re

import jieba

_SENT_END = re.compile(r"(?<=[。！？!?；;])")
_CJK = re.compile(r"[一-鿿]")


def split_sentences(text: str) -> list[str]:
    out: list[str] = []
    for line in text.split("\n"):
        for part in _SENT_END.split(line):
            part = part.strip()
            if part:
                out.append(part)
    return out


def tokenize(sentence: str) -> list[str]:
    return [t for t in jieba.lcut(sentence) if _CJK.search(t)]


def cjk_ratio(text: str) -> float:
    return len(_CJK.findall(text)) / max(len(text), 1)

#!/usr/bin/env python3
"""从本机 unicodedata 生成 EAW 宽度区间表 → ts/src/eaw.json。
_wide_ranges = W|F|A 的合并区间；_combining_ranges = combining 的合并区间。
TS 侧无 unicodedata，用这张与 Python 同版本的表保证逐码点一致。"""
import json
import os
import unicodedata as ud

WIDE = set()
COMB = set()
for cp in range(0x110000):
    ch = chr(cp)
    if ud.combining(ch):
        COMB.add(cp)
    if ud.east_asian_width(ch) in ("W", "F", "A"):
        WIDE.add(cp)

def ranges(s):
    out = []
    for cp in sorted(s):
        if out and cp == out[-1][1] + 1:
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return out

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ts", "src", "eaw.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"wide": ranges(WIDE), "combining": ranges(COMB)}, f, separators=(",", ":"))
print(f"eaw.json: wide={len(ranges(WIDE))} ranges, combining={len(ranges(COMB))} ranges")

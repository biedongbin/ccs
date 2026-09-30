#!/usr/bin/env python3
"""导出 ccs 的 _LANG_DATA 为 ts/src/i18n.json（Node 版 i18n 零手工）。"""
import importlib.machinery, importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "ccs", os.path.join(ROOT, "ccs"),
    loader=importlib.machinery.SourceFileLoader("ccs", os.path.join(ROOT, "ccs")))
ccs = importlib.util.module_from_spec(spec)
sys.modules["ccs"] = ccs
spec.loader.exec_module(ccs)

out = {lang: dict(zip(ccs.I18N_KEYS, vals)) for lang, vals in ccs._LANG_DATA.items()}
dst = os.path.join(ROOT, "ts", "src", "i18n.json")
with open(dst, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
print(f"i18n.json: {len(out)} langs x {len(ccs.I18N_KEYS)} keys -> {dst}")

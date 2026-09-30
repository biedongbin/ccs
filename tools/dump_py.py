#!/usr/bin/env python3
"""M1 对拍基准：import 根 ccs，对 ts/fixtures 逐个 parse + scan + launch_dir，出规范 JSON。

运行：python3 tools/dump_py.py   （可重复；期望值一律以 Python 现行为准）
"""
import importlib.machinery
import importlib.util
import json
import os
import sys
from dataclasses import asdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
_CCS = os.path.join(ROOT, "ccs")
spec = importlib.util.spec_from_file_location(
    "ccs", _CCS, loader=importlib.machinery.SourceFileLoader("ccs", _CCS))
ccs = importlib.util.module_from_spec(spec)
sys.modules["ccs"] = ccs
spec.loader.exec_module(ccs)

FIX = os.path.join(ROOT, "ts", "fixtures")
PROJ = os.path.join(FIX, "projects")
ARCH = os.path.join(FIX, "archive")
PROJ_E = os.path.join(PROJ, "-w-projA")
ARCH_E = os.path.join(ARCH, "-w-projA")
OUT = os.path.join(ROOT, "ts", "test", "parity_py.json")

# ---- launch_dir 共享树（幂等创建，两侧同构调用）----
LD_ROOT = "/tmp/ccs_parity_ld"
os.makedirs(os.path.join(LD_ROOT, "my-project-x", "src"), exist_ok=True)


def norm_meta(m):
    d = asdict(m)
    d["kind"] = "meta"
    return d


def main():
    parse_out = {}
    for sub in (PROJ_E, ARCH_E):
        for fn in sorted(os.listdir(sub)):
            if not fn.endswith(".jsonl"):
                continue
            p = os.path.join(sub, fn)
            r = ccs.parse_jsonl(p)
            if isinstance(r, ccs.SessionMeta):
                parse_out[fn] = norm_meta(r)
            elif isinstance(r, ccs.Sidecar):
                parse_out[fn] = {"kind": "sidecar", "leaf": r.leaf, "summary": r.summary}
            else:
                parse_out[fn] = {"kind": "none"}

    cases = json.load(open(os.path.join(FIX, "launchdir_cases.json"), encoding="utf-8"))
    ld_out = {name: ccs.launch_dir(c["encoded"], c["hint"]) for name, c in cases.items()}

    scan_out = [asdict(m) for m in ccs.scan_projects(PROJ_E, ARCH_E)]

    out = {"parse": parse_out, "launch_dir": ld_out, "scan": scan_out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"baseline -> {OUT}: parse={len(parse_out)} scan={len(scan_out)} ld={len(ld_out)}")


if __name__ == "__main__":
    main()

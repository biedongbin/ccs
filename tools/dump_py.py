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


def _meta(path):
    """store 组用的最小 meta 替身（asdict 需真 SessionMeta，这里只用到 path）。"""
    return type("M", (), {"path": path})()


def _tree(root):
    """相对路径排序清单（文件集合），供落盘状态比对。"""
    out = []
    for base, _dirs, files in os.walk(root):
        for fn in files:
            out.append(os.path.relpath(os.path.join(base, fn), root))
    return sorted(out)


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

    # ---- width 组：_dw/_cut/_pad/_hard_wrap/_md_lines/_fold_wide 刁钻用例 ----
    dw_ins = ["", "abc", "中文", "★·—é", "é", "😀👍", "​",
              "한국어", "ｆｕｌｌ", "Ωmega", "Привет", "中文abc123!"]
    cut_ins = [("中文" * 10, 5), ("abc中文def", 6), ("😀" * 5, 3), ("", 4), ("ab", 10)]
    pad_ins = [("标题", 8), (" longer ", 4), ("a", 0), ("中文abc", 7)]
    help_zh = (" jk 选择 | / 搜索 | Tab 选项目 | Esc 返回 | Enter 恢复 | a/u 归档还原 | d 删 | "
               "A 归档区 | J/K 详情滚动 | y/Y 复制首问/末答 | o 阅读 | r 改名 | s 总结 | F5 重扫 | q 退出")
    hw_ins = [(help_zh, 110), (help_zh, 60), (help_zh, 20), ("超长段没有分隔符" * 5, 8), ("", 10)]
    md_text = ("# 大标题\n## 二级\n#### 四级\n- 项目一\n* 项目二\n  - 嵌套\n"
               "普通 **加粗** 行\n"
               "| 列A | 更长的列B |\n| --- | --- |\n| 中文格 | **粗体格** |\n| 单列 |\n"
               "```python\nprint('hi')\n```\n"
               "超宽行" * 12)
    md_ins = [(md_text, 40), (md_text, 200), ("", 10), ("只是普通文本", 8)]
    fw_ins = [("x" * 30 + "中文" * 10, 12), ("中文" * 5, 100), ("", 5)]
    width_out = {
        "dw": {repr(s): ccs._dw(s) for s in dw_ins},
        "cut": [{"args": [s, w], "ret": ccs._cut(s, w)} for s, w in cut_ins],
        "pad": [{"args": [s, w], "ret": ccs._pad(s, w)} for s, w in pad_ins],
        "hard_wrap": [{"args": [t, w], "ret": ccs._hard_wrap(t, w)} for t, w in hw_ins],
        "md_lines": [{"args": [t, w], "ret": ccs._md_lines(t, w)} for t, w in md_ins],
        "fold_wide": [{"args": [t, w], "ret": ccs._fold_wide(t, w)} for t, w in fw_ins],
    }

    # ---- store 组：fresh 树上执行归档/还原/回收，记录 dest 与最终树 ----
    import shutil
    SROOT = "/tmp/ccs_parity_store"
    shutil.rmtree(SROOT, ignore_errors=True)
    proj = os.path.join(SROOT, "projects", "-w-projA")
    home = os.path.join(SROOT, "ccs")
    os.makedirs(proj, exist_ok=True)
    def _w(fn, body='{"sessionId": "sid-x"}\n'):
        p = os.path.join(proj, fn)
        with open(p, "w", encoding="utf-8") as f:
            f.write(body)
        return p
    store_out = {}
    m1 = _w("a.jsonl")
    store_out["archive"] = {"dest": ccs.do_archive(_meta(m1), home),
                            "tree": _tree(SROOT)}
    store_out["restore"] = {"dest": ccs.do_restore(_meta(store_out["archive"]["dest"]), proj),
                            "tree": _tree(SROOT)}
    store_out["archive_dest"] = ccs.archive_dest(_meta(m1), home)
    tdests = []
    for _ in range(3):                       # 源同名会互相覆盖 → 逐次 write→trash
        tp = _w("t.jsonl")
        tdests.append(ccs.do_trash(_meta(tp), home))
    store_out["trash3"] = {"dests": tdests, "tree": _tree(SROOT)}
    old = {k: os.environ.get(k) for k in ("CCS_PROJECTS_DIR", "CCS_HOME")}
    try:
        os.environ.pop("CCS_PROJECTS_DIR", None)
        os.environ.pop("CCS_HOME", None)
        store_out["paths_default"] = ccs.paths()
        os.environ["CCS_PROJECTS_DIR"] = "/p"
        os.environ["CCS_HOME"] = "/h"
        store_out["paths_env"] = ccs.paths()
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    # ---- argv 组：semantic / summary / resume（SHELL 双侧钉死，基线跨机稳定）----
    os.environ["SHELL"] = "/bin/parity-shell"
    sem_sessions = []
    for fn in sorted(os.listdir(PROJ_E)):
        if fn.endswith(".jsonl"):
            mm = ccs.parse_jsonl(os.path.join(PROJ_E, fn))
            if isinstance(mm, ccs.SessionMeta):
                sem_sessions.append(mm)
    # 查询带数字时间词 → 绕开 mtime 窗（基线确定性）；窗口语义由 test_ccs.py / tui.test.cjs 锁定
    argv_out = {
        "semantic": ccs.build_semantic_argv(sem_sessions, "15天前 修复登录"),
        "summary": ccs.build_summary_argv(sem_sessions[0]),
        "resume_full": ccs.build_resume_argv(
            ccs.SessionMeta(sid="sid-weird'; rm -rf x", title="t", cwd="/w"),
            cmd="claude --resume {sid}"),
        "resume_base": ccs.build_resume_argv(
            ccs.SessionMeta(sid="deadbeef-1234", title="t", cwd="/w"), cmd="cc"),
    }

    out = {"parse": parse_out, "launch_dir": ld_out, "scan": scan_out,
           "width": width_out, "store": store_out, "argv": argv_out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"baseline -> {OUT}: parse={len(parse_out)} scan={len(scan_out)} ld={len(ld_out)}")


if __name__ == "__main__":
    main()

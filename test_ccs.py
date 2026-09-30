#!/usr/bin/env python3
"""ccs 自检。运行: python3 test_ccs.py"""
import importlib.machinery, importlib.util, json, os, sys, tempfile, time, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
_CCS = os.path.join(HERE, "ccs")
spec = importlib.util.spec_from_file_location(
    "ccs", _CCS, loader=importlib.machinery.SourceFileLoader("ccs", _CCS))
ccs = importlib.util.module_from_spec(spec)
sys.modules["ccs"] = ccs
spec.loader.exec_module(ccs)

def write_jsonl(path, objs):
    with open(path, "w", encoding="utf-8") as f:
        for o in objs:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")

def user_line(sid, cwd, text, ts="2026-09-01T00:00:00Z", sidechain=False):
    o = {"type": "user", "sessionId": sid, "cwd": cwd, "timestamp": ts,
         "gitBranch": "master", "message": {"role": "user", "content": text}}
    if sidechain: o["isSidechain"] = True
    return o

def asst_line(sid, text):
    return {"type": "assistant", "sessionId": sid, "cwd": "/w", "timestamp": "2026-09-01T00:01:00Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}}

# ---- Task 1 tests ----
def test_text_of():
    assert ccs.text_of("hello") == "hello"
    assert ccs.text_of([{"type": "thinking", "thinking": "x"}, {"type": "text", "text": "a"},
                        {"type": "text", "text": "b"}, {"type": "tool_result"}]) == "a\nb"

def test_parse_normal_str_content():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "s1.jsonl")
        write_jsonl(f, [{"type": "mode"}, user_line("sid-1", "/w/proj", "修复登录bug"),
                        asst_line("sid-1", "已修复")])
        m = ccs.parse_jsonl(f)
        assert isinstance(m, ccs.SessionMeta)
        assert m.sid == "sid-1" and m.cwd == "/w/proj" and m.branch == "master"
        assert m.title == "修复登录bug" and m.last_reply == "已修复"

def test_parse_list_content_and_internal_skip():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "s2.jsonl")
        write_jsonl(f, [
            user_line("sid-2", "/w", "Below is a conversation log from a Claude Code session.\nCreate a summary..."),
            user_line("sid-2", "/w", [{"type": "text", "text": "真正的第一个问题"}]),
            user_line("sid-2", "/w", "sidechain 问题", sidechain=True),
            asst_line("sid-2", "答复")])
        m = ccs.parse_jsonl(f)
        assert m.title == "真正的第一个问题"  # 内部 prompt 与 sidechain 被跳过

def test_parse_sidecar_only_file():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "summary.jsonl")
        write_jsonl(f, [{"type": "summary", "summary": "会话标题", "leafUuid": "sid-9"}])
        m = ccs.parse_jsonl(f)
        assert isinstance(m, ccs.Sidecar) and m.leaf == "sid-9" and m.summary == "会话标题"

def test_parse_infile_summary_and_bad_message():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "cont.jsonl")
        write_jsonl(f, [
            {"type": "summary", "summary": "续会话标题", "leafUuid": "prev-1"},
            user_line("sid-c", "/w", "第一问"),
            {"type": "user", "sessionId": "sid-c", "message": None},
            {"type": "assistant", "sessionId": "sid-c", "message": "hi"}])
        m = ccs.parse_jsonl(f)
        assert m.title == "续会话标题"   # 四级降级第 2 级：文件内 summary
        assert m.sid == "sid-c"          # message 非 dict 的行不崩、不污染

def test_parse_malformed_and_fallback():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "badname.jsonl")
        with open(f, "w", encoding="utf-8") as fh:
            fh.write("not json\n" * 3 + json.dumps({"type": "mode"}) + "\n")
        m = ccs.parse_jsonl(f)
        assert isinstance(m, ccs.SessionMeta) and m.title == "badname"  # 无有效行→文件名
        assert m.sid == "" and m.cwd == ""

def test_rel_time():
    now = time.time()
    assert ccs.rel_time(now - 30, now) == "刚刚"
    assert ccs.rel_time(now - 7200, now) == "2小时前"
    assert ccs.rel_time(now - 3 * 86400, now) == "3天前"

# ---- Task 2 tests ----
def _fake_tree():
    td = tempfile.mkdtemp()
    proj = os.path.join(td, "projects", "-w-projA")
    arch = os.path.join(td, "ccs", "archive", "-w-projA")
    os.makedirs(proj); os.makedirs(arch)
    return td, proj, arch

def test_scan_and_sidecar_title():
    td, proj, arch = _fake_tree()
    write_jsonl(os.path.join(proj, "aaa.jsonl"),
                [user_line("sid-A", "/w/projA", "旧标题内容")])
    write_jsonl(jsonl_path := os.path.join(proj, "summary-aaa.jsonl"),
                [{"type": "summary", "summary": "官方摘要标题", "leafUuid": "sid-A"}])
    sessions = ccs.scan_projects(proj, arch)
    assert len(sessions) == 1                      # sidecar 不单独成条
    assert sessions[0].title == "官方摘要标题"      # leafUuid 匹配覆盖标题

def test_title_newline_sanitized():
    """多行首问 → title 单行；addstr 遇 \n 折行会泄漏到边框外（实际事故）。"""
    td, proj, arch = _fake_tree()
    write_jsonl(os.path.join(proj, "multi.jsonl"),
                [user_line("sid-multi", "/w/projA", "第一行\n\n第二行 内容")])
    sessions = ccs.scan_projects(proj, arch)
    assert sessions[0].title == "第一行 第二行 内容"
    assert "\n" not in sessions[0].title

def test_scan_archive_flag_and_order():
    td, proj, arch = _fake_tree()
    write_jsonl(os.path.join(proj, "old.jsonl"), [user_line("sid-old", "/w/projA", "旧会话")])
    write_jsonl(os.path.join(proj, "new.jsonl"), [user_line("sid-new", "/w/projA", "新会话")])
    write_jsonl(os.path.join(arch, "arch1.jsonl"), [user_line("sid-arch", "/w/projA", "归档会话")])
    os.utime(os.path.join(proj, "old.jsonl"), (1, 1))       # 1970
    os.utime(os.path.join(proj, "new.jsonl"), (time.time(), time.time()))
    sessions = ccs.scan_projects(proj, arch)
    assert [s.archived for s in sessions] == [False, True, False]  # mtime 降序: new, arch1(现在), old
    assert sessions[0].sid == "sid-new"

def test_cache_hit_and_invalidate():
    td, proj, arch = _fake_tree()
    f = os.path.join(proj, "x.jsonl")
    write_jsonl(f, [user_line("sid-x", "/w/projA", "缓存测试")])
    cache = ccs.Cache(os.path.join(td, "ccs"))
    s1 = ccs.scan_projects(proj, arch, cache=cache)[0]
    cache.save()
    assert cache.get(f"v{ccs.CACHE_VERSION}|{f}|{os.stat(f).st_mtime_ns}") is not None  # 版本化 ns 键
    c2 = ccs.Cache(os.path.join(td, "ccs"))                    # 重新加载
    s2 = ccs.scan_projects(proj, arch, cache=c2)[0]
    assert s2.title == "缓存测试"
    write_jsonl(f, [user_line("sid-x", "/w/projA", "改过的标题")])  # mtime 变→重解析
    s3 = ccs.scan_projects(proj, arch, cache=c2)[0]
    assert s3.title == "改过的标题"

def test_scan_env_paths_dedup_and_depth():
    td, proj, arch = _fake_tree()          # projects/-w-projA 两级结构，与真实布局一致
    os.environ["CCS_PROJECTS_DIR"] = os.path.join(td, "projects")
    os.environ["CCS_HOME"] = os.path.join(td, "ccs")
    try:
        write_jsonl(os.path.join(proj, "s.jsonl"), [user_line("sid-s", "/w/projA", "真实布局标题")])
        metas = ccs.scan()
        assert [m.sid for m in metas] == ["sid-s"]      # 恰一条：无重复、无遗漏
        assert metas[0].archived is False
    finally:
        os.environ.pop("CCS_PROJECTS_DIR", None)
        os.environ.pop("CCS_HOME", None)

# ---- Task 3 tests ----
def test_archive_roundtrip_and_trash():
    td, proj, arch = _fake_tree()
    home = os.path.join(td, "ccs")
    f = os.path.join(proj, "t3.jsonl")
    write_jsonl(f, [user_line("sid-t3", "/w/projA", "归档往返")])
    m = ccs.parse_jsonl(f)
    dest = ccs.do_archive(m, home)
    assert dest == os.path.join(home, "archive", "-w-projA", "t3.jsonl")
    assert not os.path.exists(f) and os.path.exists(dest)
    sessions = ccs.scan_projects(proj, os.path.join(home, "archive", "-w-projA"))
    assert sessions[0].archived is True
    m2 = ccs.parse_jsonl(dest); m2.archived = True
    back = ccs.do_restore(m2, os.path.dirname(proj))   # 传 projects 根，还原到 <根>/<encoded>/
    assert back == f and os.path.exists(f)

def test_rebuild_keeps_cursor_and_filter():
    """a/u/d 后：光标原地补位（不回顶），query/project 过滤保留。"""
    metas = [ccs.SessionMeta(sid=f"s{i}", title=f"t{i}", cwd="/w", size=1) for i in range(5)]
    st = ccs.AppState(metas)
    st.project = "/w"
    st.cursor = 3
    st2 = ccs._rebuild(st, metas[:-1], False)          # 删一条 → 4 条
    assert st2.cursor == 3                              # 原行补位，不回顶
    assert st2.project == "/w" and st2.query == ""
    st3 = ccs._rebuild(st, metas[:1], False)            # 删到只剩 1 条
    assert st3.cursor == 0                              # 收敛到边界
    st4 = ccs._rebuild(st, [], False)                   # 全删 → 空
    assert st4.cursor == 0 and st4.current() is None

def test_trash_no_rm_and_collision():
    td, proj, arch = _fake_tree()
    home = os.path.join(td, "ccs")
    for txt in ("第一个", "第二个"):
        src = os.path.join(proj, "dup.jsonl")
        write_jsonl(src, [user_line("s", "/w/projA", txt)])
        m = ccs.parse_jsonl(src)
        dest = ccs.do_trash(m, home)
    assert os.path.exists(os.path.join(home, "trash", "dup.jsonl"))
    assert os.path.exists(os.path.join(home, "trash", "dup.jsonl.1"))  # 重名不覆盖

# ---- Task 4 tests ----
def test_build_direct_argv():
    m = ccs.SessionMeta(sid="sid-3", title="t", cwd="/w")
    assert ccs.build_direct_argv(m) == ["claude", "--resume", "sid-3"]

# ---- Task 5 tests ----
def _S(sid, title, cwd, mt, arch=False):
    return ccs.SessionMeta(sid=sid, title=title, cwd=cwd, mtime=mt, archived=arch)

def test_appstate_filter_and_nav():
    ss = [_S("s1", "登录修复", "/w/a", 300.0), _S("s2", "部署脚本", "/w/b", 200.0),
          _S("s3", "登录页面样式", "/w/a", 100.0), _S("s4", "旧会话", "/w/c", 50.0, arch=True)]
    st = ccs.AppState(ss)
    assert len(st.visible()) == 3                     # 默认不看归档
    st.query = "登录"
    assert [m.sid for m in st.visible()] == ["s1", "s3"]
    st.query = "S2"                                   # 大小写不敏感，匹配 sid
    assert [m.sid for m in st.visible()] == ["s2"]
    st.query = ""
    st.project = "/w/a"
    assert [m.sid for m in st.visible()] == ["s1", "s3"]
    assert st.projects()[0][0] == "/w/a"              # 最近活动项目排最前
    st.project = None
    st.move(1); assert st.current().sid == "s2"
    st.move(-5); assert st.cursor == 0                # 越界钳制

def test_appstate_archive_view():
    ss = [_S("s1", "t", "/w/a", 1.0), _S("s4", "旧会话", "/w/c", 50.0, arch=True)]
    st = ccs.AppState(ss, archive_view=True)
    assert [m.sid for m in st.visible()] == ["s4"]

# ---- 终审修复回归 ----
def test_scan_persists_cache():
    td, proj, arch = _fake_tree()
    os.environ["CCS_PROJECTS_DIR"] = os.path.join(td, "projects")
    os.environ["CCS_HOME"] = os.path.join(td, "ccs")
    try:
        write_jsonl(os.path.join(proj, "p.jsonl"), [user_line("sid-p", "/w/projA", "落盘测试")])
        metas = ccs.scan()
        cache2 = ccs.Cache(os.path.join(td, "ccs"))
        assert cache2.get(f"v{ccs.CACHE_VERSION}|{os.path.join(proj, 'p.jsonl')}|{os.stat(os.path.join(proj, 'p.jsonl')).st_mtime_ns}") is not None
    finally:
        os.environ.pop("CCS_PROJECTS_DIR", None)
        os.environ.pop("CCS_HOME", None)


# ---- 宽度/清洗 修复测试 ----
def test_display_width_cut_pad():
    assert ccs._dw("ab") == 2 and ccs._dw("中") == 2
    assert ccs._dw("30分钟前") == 8
    assert ccs._cut("中中中", 5) == "中中"
    assert ccs._cut("ab中", 3) == "ab"
    assert ccs._dw(ccs._cut("中中中", 5)) <= 5
    assert ccs._dw(ccs._pad("中", 5)) == 5

def test_clean_title_strips_command_tags():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "cmd.jsonl")
        write_jsonl(f, [
            user_line("s1", "/w", "<command-name>/clear</command-name><command-message>clear</command-message>"),
            user_line("s1", "/w", "真正的问题")])
        m = ccs.parse_jsonl(f)
        assert m.title == "真正的问题"


def test_cache_version_bump_forces_reparse():
    td, proj, arch = _fake_tree()
    f = os.path.join(proj, "v.jsonl")
    write_jsonl(f, [user_line("sid-v", "/w/projA", "新解析标题")])
    cache = ccs.Cache(os.path.join(td, "ccs"))
    mtime_ns = int(os.stat(f).st_mtime_ns)
    cache.data[f"{f}|{mtime_ns}"] = {"sid": "sid-v", "title": "旧缓存标题", "cwd": "/w/projA",
                                     "branch": "m", "first_user": "", "last_reply": ""}  # 旧版本格式裸条目
    cache.save()
    metas = ccs.scan_projects(proj, arch, ccs.Cache(os.path.join(td, "ccs")))
    assert metas[0].title == "新解析标题"          # 版本不匹配 → 必须重解析

def test_continuation_boilerplate_skipped():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "cont2.jsonl")
        write_jsonl(f, [
            user_line("s2", "/w", "This session is being continued from a previous conversation."),
            user_line("s2", "/w", "续聊的真正问题")])
        m = ccs.parse_jsonl(f)
        assert m.title == "续聊的真正问题"


def test_detail_lines_structure():
    m = ccs.SessionMeta(sid="s", title="t", cwd="/w", branch="m", size=2048,
                        first_user="问", last_reply="答")
    rows = ccs._detail_lines(m, 40)
    for row in rows:
        assert isinstance(row, list), f"行必须是段列表: {row!r}"
        for seg in row:
            assert isinstance(seg, tuple) and len(seg) == 2, f"段必须是(文本,attr): {seg!r}"
    texts = [seg[0] for row in rows for seg in row]
    assert any(t.startswith("---") for t in texts)      # 通栏分割线存在
    assert "首条提问" in texts and "最后回复" in texts


def test_first_user_beyond_head_budget():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "deep.jsonl")
        objs = [user_line("s9", "/w", "<command-name>/clear</command-name>"),
                {"type": "progress", "data": "y" * 60000},
                {"type": "progress", "data": "z" * 60000},
                user_line("s9", "/w", "深处的问题"),
                asst_line("s9", "p" * 70000),
                asst_line("s9", "q" * 70000)]
        write_jsonl(f, objs)
        m = ccs.parse_jsonl(f)
        assert m.first_user == "深处的问题"
        assert m.title == "深处的问题"



def test_launch_dir_hint_ancestor():
    # 编码目录名 + 文件内(可能 cd 过的) cwd → 反推真实启动目录
    assert ccs.launch_dir("-w-ai-robot-coding", "/w/ai-robot-coding/deep/dir") == "/w/ai-robot-coding"

def test_launch_dir_fs_greedy():
    td = tempfile.mkdtemp()
    real = os.path.join(td, "ai-robot-coding", "sub")
    os.makedirs(real)
    assert ccs.launch_dir(real.replace("/", "-"), "") == real   # 连字符目录名贪心解码

def test_parse_cwd_is_launch_dir_not_churned():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "-w-proj", "s.jsonl")
        os.makedirs(os.path.dirname(f))
        write_jsonl(f, [user_line("s1", "/w/proj/deep/cd-ed", "问题")])
        m = ccs.parse_jsonl(f)
        assert m.cwd == "/w/proj"


def test_launch_dir_restores_underscore():
    # 编码把 _ . / 全压成 "-"；hint 祖先按同规则编码比对，还原真实路径
    enc = "-Users-u-workspace-biedb-tmp-claude-session"
    assert ccs.launch_dir(enc, "/Users/u/workspace/biedb_tmp/claude_session/src") \
        == "/Users/u/workspace/biedb_tmp/claude_session"

def test_parse_cwd_restores_underscore_dir():
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "-w-my-proj", "s.jsonl")
        os.makedirs(os.path.dirname(f))
        write_jsonl(f, [user_line("s1", "/w/my_proj/src", "问题")])
        m = ccs.parse_jsonl(f)
        assert m.cwd == "/w/my_proj"



def test_sdk_cli_sessions_hidden():
    td, proj, arch = _fake_tree()
    os.environ["CCS_PROJECTS_DIR"] = os.path.join(td, "projects")
    os.environ["CCS_HOME"] = os.path.join(td, "ccs")
    try:
        write_jsonl(os.path.join(proj, "mine.jsonl"),
                    [{"type": "user", "sessionId": "s-cli", "cwd": "/w/projA", "timestamp": "2026-09-01T00:00:00Z",
                      "gitBranch": "m", "entrypoint": "cli", "message": {"role": "user", "content": "我的会话"}}])
        write_jsonl(os.path.join(proj, "compact.jsonl"),
                    [{"type": "user", "sessionId": "s-sdk", "cwd": "/w/projA", "timestamp": "2026-09-01T00:00:00Z",
                      "gitBranch": "m", "entrypoint": "sdk-cli",
                      "message": {"role": "user", "content": "Below is a conversation log..."}}])
        metas = ccs.scan()
        assert [m.sid for m in metas] == ["s-cli"]     # sdk-cli 衍生会话默认隐藏
    finally:
        os.environ.pop("CCS_PROJECTS_DIR", None)
        os.environ.pop("CCS_HOME", None)


def test_clamp_off_follows_cursor():
    f = ccs._clamp_off
    assert f(0, 0, 100, 10) == 0
    assert f(9, 0, 100, 10) == 0            # 窗口内
    assert f(10, 0, 100, 10) == 1           # 越出下界 → 跟随
    assert f(99, 0, 100, 10) == 90          # 末项 → 窗口贴底（off=99-10+1）
    assert f(99, 95, 100, 10) == 90         # clamp 到 n-cap
    assert f(5, 90, 100, 10) == 5           # 越出上界 → 跟随（光标贴窗口顶）
    assert f(3, 0, 3, 10) == 0              # cap > n


def test_config_roundtrip():
    td = tempfile.mkdtemp()
    ccs.save_config({"lang": "ja", "theme": "dracula"}, td)
    assert ccs.load_config(td) == {"lang": "ja", "theme": "dracula"}
    assert ccs.load_config(os.path.join(td, "nope")) == {}   # 无文件 → 空配置

def test_strings_10_langs_complete():
    assert len(ccs.STRINGS) >= 10
    for lang, s in ccs.STRINGS.items():
        missing = set(ccs.I18N_KEYS) - set(s)
        assert not missing, f"{lang} 缺: {missing}"

def test_rel_time_i18n():
    now = time.time()
    old = ccs._LANG
    try:
        ccs._LANG = "en"
        assert ccs.rel_time(now - 3 * 86400, now) == "3d ago"
        ccs._LANG = "ja"
        assert ccs.rel_time(now - 7200, now) == "2時間前"
    finally:
        ccs._LANG = old

def test_user_themes():
    cfg = {"custom": {"a": ["red", "green"], "b": ["nope", "green"],
                      "c": ["cyan"], "d": [200, 7], "e": "red"}}
    assert ccs._user_themes(cfg) == {"a": (1, 2), "d": (200, 7)}

def test_copy_backend():
    real = ccs._shutil.which
    try:
        ccs._shutil.which = lambda n: {"pbcopy": "/usr/bin/pbcopy"}.get(n)
        assert ccs._copy_backend() == (["pbcopy"], "utf-8")
        ccs._shutil.which = lambda n: {"clip": "clip.exe"}.get(n)
        assert ccs._copy_backend() == (["clip"], "utf-16")
        ccs._shutil.which = lambda n: None
        assert ccs._copy_backend() == (None, None)
    finally:
        ccs._shutil.which = real

def test_display_width_unicode():
    assert ccs._dw("\u4e2d\u6587") == 4            # 汉字 W → 2 列
    assert ccs._dw("\u304b\u306a\u30ab\u30ca") == 8   # 假名 W → 2 列
    assert ccs._dw("\ud55c\uad6d\uc5b4") == 6     # 谚文 W → 2 列
    assert ccs._dw("caf\u00e9") == 5               # é 属歧义宽度 A → 2（CJK 终端宽渲染）
    assert ccs._dw("\u041f\u0440\u0438\u0432\u0435\u0442") == 12   # 西里尔同属 A → 2（宁宽勿窄）
    assert ccs._dw("\u2605\u00b7\u2014") == 6    # 歧义宽度 A → 按 2
    assert ccs._dw("e\u0301") == 1                 # 组合符号 e+U+0301 → 0 列

def test_summaries_roundtrip():
    td = tempfile.mkdtemp()
    os.environ["CCS_HOME"] = td
    ccs.save_summaries({"s1": {"text": "核心目标…", "ts": 1}})
    assert ccs.load_summaries() == {"s1": {"text": "核心目标…", "ts": 1}}
    del os.environ["CCS_HOME"]

def test_detail_summary_block():
    m = ccs.SessionMeta(sid="sid-x", title="t", cwd="/w", size=1,
                        first_user="问", last_reply="答")
    sums = {"sid-x": {"text": "核心目标：X\n进度 80%", "ts": 1}}
    rows = ccs._detail_lines(m, 40, sums=sums)
    texts = [seg[0] for row in rows for seg in row]
    assert "AI 总结" in texts and "核心目标：X" in texts

def test_title_chain_official():
    """标题链对齐官方：custom > ai > summary > 首问；ai-title 后写覆盖先写。"""
    td, proj, arch = _fake_tree()
    write_jsonl(os.path.join(proj, "t1.jsonl"),
                [user_line("sid-t1", "/w/projA", "原始首问"),
                 {"type": "ai-title", "aiTitle": "AI 生成的标题", "sessionId": "sid-t1"},
                 {"type": "custom-title", "customTitle": "用户改名", "sessionId": "sid-t1"}])
    write_jsonl(os.path.join(proj, "t2.jsonl"),
                [user_line("sid-t2", "/w/projA", "原始首问二"),
                 {"type": "ai-title", "aiTitle": "旧标题", "sessionId": "sid-t2"},
                 {"type": "ai-title", "aiTitle": "新标题", "sessionId": "sid-t2"}])
    ss = {m.sid: m for m in ccs.scan_projects(proj, arch)}
    assert ss["sid-t1"].title == "用户改名"
    assert ss["sid-t2"].title == "新标题"          # 末条生效

def test_do_rename_roundtrip():
    td, proj, arch = _fake_tree()
    os.environ["CCS_HOME"] = os.path.join(td, "ccs")
    try:
        f = os.path.join(proj, "r.jsonl")
        write_jsonl(f, [user_line("sid-r", "/w/projA", "旧标题内容")])
        m = ccs.scan_projects(proj, arch)[0]
        mt0 = os.stat(f).st_mtime_ns
        assert ccs.do_rename(m, "新名字")
        assert os.stat(f).st_mtime_ns == mt0        # mtime 恢复：改名不冒充新活动
        m2 = ccs.scan_projects(proj, arch)[0]
        assert m2.title == "新名字"                  # mtime 未变 → 缓存已按 path 驱逐，重解析生效
        assert m2.custom_title == "新名字"
    finally:
        os.environ.pop("CCS_HOME", None)

def test_resume_cmd_custom():
    m = ccs.SessionMeta(sid="s9", title="t", cwd="/w", size=1)
    a = ccs.build_direct_argv(m, cmd="claude --dangerously-skip-permissions --resume {sid}")
    assert a == ["claude", "--dangerously-skip-permissions", "--resume", "s9"]
    b = ccs.build_direct_argv(m, cmd="claude -p {sid}")
    assert b == ["claude", "-p", "s9"]
    c = ccs.build_direct_argv(m, cmd="cc")                      # 只填基础命令 → 自动追加
    assert c == ["cc", "--resume", "s9"]
    assert ccs.resume_cmd_full("cc --resume {sid}") == "cc --resume {sid}"   # 完整模板兼容
    assert ccs.resume_cmd_full("claude --dangerously-skip-permissions") == \
        "claude --dangerously-skip-permissions --resume {sid}"

def test_resume_shell_function_fallback():
    """resume_cmd 一律交用户交互 shell：函数/alias（可能遮蔽同名二进制）与终端行为一致。"""
    m = ccs.SessionMeta(sid="s9", title="t", cwd="/w", size=1)
    old = os.environ.get("SHELL")
    os.environ["SHELL"] = "/bin/zsh"
    try:
        a = ccs.build_resume_argv(m, cmd="cc --resume {sid}")
        assert a == ["/bin/zsh", "-ic", "cc --resume s9"]
        b = ccs.build_resume_argv(m, cmd="claude --resume {sid}")
        assert b == ["/bin/zsh", "-ic", "claude --resume s9"]
        assert ccs.build_resume_argv(m, cmd="cc --resume {sid}")[0] != "cc"   # 永不 execvp clang
    finally:
        if old is None:
            os.environ.pop("SHELL", None)
        else:
            os.environ["SHELL"] = old

def test_last_reply_budget():
    """末答预算 500→4000：长回复不再截断成半句。"""
    td, proj, arch = _fake_tree()
    long_reply = "很长的回复" * 900            # 4500 字符
    write_jsonl(os.path.join(proj, "lr.jsonl"),
                [user_line("sid-lr", "/w/projA", "问"),
                 {"type": "assistant", "message": {"role": "assistant", "content": long_reply},
                  "sessionId": "sid-lr"}])
    m = ccs.scan_projects(proj, arch)[0]
    assert len(m.last_reply) == 4000
    assert m.last_reply.endswith("的回复") or len(m.last_reply) > 500

def test_md_lines():
    """markdown 轻渲染：表格对齐/标题映射/围栏/粗体剥离/超宽折行。"""
    md = "## 标题x\n| a | bb |\n|---|---|\n| c | d |\n```python\nprint(1)\n```\n**加粗** b\n"
    ls = ccs._md_lines(md, 40)
    assert ls[0] == "▪ 标题x"
    assert "a  bb" in ls[0 + 1] and "c  d" in "".join(ls)   # 列对齐（a 后垫空格对齐 bb）
    assert not any("---" in l for l in ls)                    # 对齐行剔除
    assert not any("```" in l for l in ls)                    # 围栏行消失
    assert any(l.strip() == "print(1)" for l in ls)           # 代码行保留（缩进）
    assert any(l == "加粗 b" for l in ls)                     # ** 剥离
    wide = ccs._md_lines("超" * 60, 40)
    assert all(ccs._dw(l) <= 40 for l in wide) and len(wide) == 3   # 120 列 ÷ 40 = 3 行

def test_hard_wrap_segments():
    """帮助行按 '|' 段折行：同一键的说明不拆成两行。"""
    ls = ccs._hard_wrap(" jk 选择 | / 搜索 | Enter 恢复 | q 退出", 20)
    assert len(ls) >= 2
    assert any("Enter 恢复" in l for l in ls)                 # 段完整
    assert not any(l.strip() in ("删", "出", "复", "原") for l in ls)   # 无被腰斩的单字段残行

if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn(); print(f"PASS {fn.__name__}")
        except Exception:
            failed += 1; print(f"FAIL {fn.__name__}"); traceback.print_exc()
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

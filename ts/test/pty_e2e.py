#!/usr/bin/env python3
"""M3 pty 端到端：node dist/cli.js 真终端渲染断言。
注意：ink 对 CJK 渲染会插入对齐空格，断言一律先去空格。"""
import os, pty, shutil, struct, termios, fcntl, time, select, sys
import pyte

TS = "/Users/biedongbin/workspace/biedb_tmp/claude_session/ts"
W, H = 110, 30
HOME = "/tmp/ccs_pty_home"
PROJ = "/tmp/ccs_pty_proj"

LONG_REPLY = ("已修复完毕的详细回复。" + "追加：一、背景说明与约束条件；二、处理过程细节一二三四五六七八九十；"
              "三、验证结论与后续事项甲乙丙丁戊己庚辛壬癸。" * 30)

def setup():
    shutil.rmtree(HOME, ignore_errors=True)
    shutil.rmtree(PROJ, ignore_errors=True)
    os.makedirs(HOME)
    enc = os.path.join(PROJ, "-tmp-alpha")
    os.makedirs(enc)
    with open(os.path.join(enc, "a.jsonl"), "w") as f:
        f.write('{"type":"user","sessionId":"sid-a","cwd":"/tmp/alpha","gitBranch":"master","message":{"role":"user","content":"修复登录问题"}}\n')
        f.write('{"type":"assistant","sessionId":"sid-a","cwd":"/tmp/alpha","message":{"role":"assistant","content":[{"type":"text","text":"' + LONG_REPLY + '"}]}}\n')
    with open(os.path.join(enc, "b.jsonl"), "w") as f:
        f.write('{"type":"user","sessionId":"sid-b","cwd":"/tmp/alpha","gitBranch":"dev","message":{"role":"user","content":"搜索功能优化任务"}}\n')

def run(args, keys=(), wait=1.8, first_wait=2.5):
    setup()
    with open(os.path.join(HOME, "config.json"), "w") as f:   # 预写跳过首跑问答
        f.write('{"lang":"zh","theme":"default"}')
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["CCS_HOME"] = HOME
        os.environ["CCS_PROJECTS_DIR"] = PROJ
        os.environ["TERM"] = "xterm-256color"
        os.environ["ESCDELAY"] = "0"
        os.chdir(TS)
        os.execvp("node", ["node", "dist/cli.js"] + args)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", H, W, 0, 0))
    sc = pyte.Screen(W, H)
    st = pyte.ByteStream(sc)
    def drain(t=0.4):
        while select.select([fd], [], [], t)[0]:
            try:
                d = os.read(fd, 65536)
            except OSError:
                return
            if not d:
                return
            st.feed(d)
    time.sleep(first_wait); drain()
    for kb in keys:
        os.write(fd, kb); time.sleep(wait); drain()
    try:
        os.kill(pid, 9); os.waitpid(pid, 0)
    except ProcessLookupError:
        pass
    lines = ["".join(sc.buffer[y][x].data or " " for x in range(W)) for y in range(H)]
    return "\n".join(lines).replace(" ", "")

P = F = 0
def ok(name, cond):
    global P, F
    print(("PASS " if cond else "FAIL ") + name)
    P, F = P + (1 if cond else 0), F + (0 if cond else 1)

# 1. 首帧
frame = run([])
ok("1 首帧·标题两行", "修复登录问题" in frame and "搜索功能优化任务" in frame)
ok("1 首帧·顶栏计数", "ccs·2" in frame)
ok("1 首帧·详情栏字段", "ID" in frame and "分支" in frame and "首条提问" in frame)
ok("1 首帧·帮助行", "Enter恢复" in frame and "q退出" in frame)

# 2. j 移动（游标到第二条，渲染稳定）
frame = run([], [b"j"])
ok("2 j 移动", "修复登录问题" in frame and "ccs·2" in frame)

# 3. pager
frame = run([], [b"o"])
ok("3 pager 打开·页码", "[1/" in frame)
frame = run([], [b"j", b"o", b"j"])
ok("3 pager j 滚动（长内容可滚）", "[2/" in frame)
frame = run([], [b"o", b"q"])
ok("3 pager q 返回列表", "ccs·2" in frame and "[1/" not in frame)

# 4. --config 列表页
frame = run(["--config"])
ok("4 config·四配置项", "语言lang" in frame and "主题theme" in frame
   and "resume_cmd" in frame and "调色板" in frame)
ok("4 config·当前值列", "claude--resume" in frame and "default" in frame)

# 4b. config → Enter 进 lang 详情页
frame = run(["--config"], [b"\n"])
ok("4b config lang 详情页", "中文(zh)" in frame and "English(en)" in frame)

# 5. q 退出（pty 内按键，验原始字节含清屏序列 + 进程退出）
def q_quit_check():
    setup()
    open(os.path.join(HOME, "config.json"), "w").write('{"lang":"zh","theme":"default"}')
    pid, fd = pty.fork()
    if pid == 0:
        os.environ.update(CCS_HOME=HOME, CCS_PROJECTS_DIR=PROJ, TERM="xterm-256color", ESCDELAY="0")
        os.chdir(TS)
        os.execvp("node", ["node", "dist/cli.js"])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", H, W, 0, 0))
    time.sleep(2.5)
    while select.select([fd], [], [], 0.3)[0]:
        try: os.read(fd, 65536)
        except OSError: break
    os.write(fd, b"q")
    time.sleep(1.2)
    raw = b""
    while select.select([fd], [], [], 0.3)[0]:
        try: d = os.read(fd, 65536)
        except OSError: break
        if not d: break
        raw += d
    try:
        _, status = os.waitpid(pid, os.WNOHANG)
        alive = _ == 0
        if alive:
            os.kill(pid, 9); os.waitpid(pid, 0)
    except ChildProcessError:
        alive = False
    return (not alive or status == 0) and b"\x1b[2J" in raw
ok("5 q 退出·清屏序列已发", q_quit_check())

print(f"\n{P} passed, {F} failed")
sys.exit(1 if F else 0)

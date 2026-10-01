/** ccs Node 版主 TUI（ink）。键位与 Python curses 版逐键等价。 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { SessionMeta } from "./parse.js";
import { scanAll, doRename, copyBackend, tilde } from "./scan.js";
import { dw, cut, pad, hardWrap, mdLines } from "./width.js";
import { loadSummaries, startSummary, pollJobs, harvestSummaries } from "./summary.js";
import { execResume, execResumeAt } from "./resume.js";
import { resumeCmdFull } from "./config.js";
import { T, relTime } from "./i18n.js";
import * as os from "os";
import * as pth from "path";
import { spawnSync } from "child_process";
import { doArchive, doRestore, doTrash, paths } from "./store.js";
import { ccsHome } from "./config.js";

// ---- 主题色（curses 色对 → ink 近似） ----
const PALETTES: Record<string, string> = {
  default: "cyan", ocean: "blue", dracula: "magenta", mono: "white",
};
function themeAccents(theme: string, custom?: Record<string, unknown>): { accent: string; msg: string } {
  const c = custom && typeof custom === "object" ? (custom as Record<string, [string, string] | number[]>) : {};
  const e = c[theme];
  if (Array.isArray(e) && e.length >= 2) {
    const a = typeof e[0] === "number" ? String(e[0]) : e[0];
    const m = typeof e[1] === "number" ? String(e[1]) : e[1];
    return { accent: a, msg: m };
  }
  return { accent: PALETTES[theme] || "cyan", msg: "yellow" };
}

interface Props {
  initialSessions: SessionMeta[];
  archiveView: boolean;
  resumeCmd: string;
  theme: string;
  custom?: Record<string, unknown>;
}

type Mode = { k: "list" } | { k: "search" } | { k: "rename" } | { k: "dir" } | { k: "picker" };

export function CcsApp(props: Props) {
  const { stdout } = useStdout();
  const [sessions, setSessions] = useState(props.initialSessions);
  const [archiveView, setArchiveView] = useState(props.archiveView);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<string | null>(pth.resolve(process.cwd()));   // R1-1: 无条件锚定启动目录（Python 等价），Esc 展开全部
  const [cursor, setCursor] = useState(0);
  const [dscroll, setDscroll] = useState(0);
  const offRef = useRef(0);                         // 左栏滚动滞后窗口（Python _clamp_off），渲染期镜像
  const [lastSid, setLastSid] = useState("");
  const [pager, setPager] = useState<{ open: boolean; off: number }>({ open: false, off: 0 });
  const [pickerIdx, setPickerIdx] = useState(0);
  const [mode, setMode] = useState<Mode>({ k: "list" });
  const [buf, setBuf] = useState("");            // rename/dir/picker 输入缓冲
  const [msg, setMsg] = useState("");
  const keepMsg = useRef(false);
  const themeRef = useRef(themeAccents(props.theme, props.custom));

  // 终端尺寸
  const [size, setSize] = useState({ h: stdout.rows || 24, w: stdout.columns || 80 });
  useEffect(() => {
    const onResize = () => setSize({ h: stdout.rows || 24, w: stdout.columns || 80 });
    stdout.on("resize", onResize);
    return () => { stdout.removeListener("resize", onResize); };
  }, [stdout]);

  // 可见行（Python AppState.visible 语义）
  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return sessions.filter((m) =>
      m.archived === archiveView
      && (!project || m.cwd === project)
      && (!q || (m.title + m.cwd + m.sid).toLowerCase().includes(q)));
  }, [sessions, archiveView, project, query]);
  const n = rows.length;
  const cur = n ? rows[Math.min(cursor, n - 1)] : null;
  const H = size.h, W = size.w;

  // 500ms tick：总结任务轮询。仅在轮询有事件时 setState——空闲零重绘
  // （Python 版消闪烁同课：timeout(500 if JOBS else -1)）；interval 常驻保活事件循环
  useEffect(() => {
    const iv = setInterval(() => {
      const evts = pollJobs();
      if (!evts.length) return;
      for (const e of evts) setMsg(e.ok ? T("sum_done", { t: e.title.slice(0, 24) }) : T("sum_fail", { t: e.title.slice(0, 24) }));
      setSessions(scanAll());
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // 详情滚动复位（换会话）
  useEffect(() => {
    if (cur && cur.sid !== lastSid) { setDscroll(0); setLastSid(cur.sid); }
  }, [cur, lastSid]);

  const helpLs = useMemo(() => hardWrap(T("help"), Math.max(10, W - 1)), [W]);
  const nh = helpLs.length;

  // ---- 键处理（模态拦截：search/rename/dir/picker 各自吃键，B12 防泄漏） ----
  const onKey = (input: string, key: { upArrow: boolean; downArrow: boolean; pageUp: boolean; pageDown: boolean; return: boolean; escape: boolean; backspace: boolean; delete: boolean; tab: boolean; ctrl: boolean; meta: boolean }) => {
    // 移动/滚动键保留状态行，其余键先清空（Python 语义）
    if (!keepMsg.current) {
      const nav = key.upArrow || key.downArrow || key.pageUp || key.pageDown
        || ["j", "k", "g", "G", "J", "K", "s"].includes(input);
      if (!nav) setMsg("");
    }
    keepMsg.current = false;

    if (mode.k === "search") {
      if (key.escape) { setQuery(""); setCursor(0); setMode({ k: "list" }); }
      else if ((key.return || input === "\n")) setMode({ k: "list" });
      else if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); setCursor(0); }
      else if (input && !key.ctrl && !key.meta) { setQuery((q) => q + input); setCursor(0); }
      return;
    }
    if (mode.k === "rename" && cur) {
      if (key.escape) setMode({ k: "list" });                       // Esc 取消，不落盘
      else if ((key.return || input === "\n")) {
        const nm = buf.trim();
        if (nm) {
          if (doRename(cur, nm)) { setSessions(scanAll()); setMsg(T("rename_ok", { t: nm.slice(0, 24) })); keepMsg.current = true; }
          else setMsg(T("op_fail", { e: "write" }));
        }
        setMode({ k: "list" });
      }
      else if (key.backspace || key.delete) setBuf((b) => b.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBuf((b) => b + input);
      return;
    }
    if (mode.k === "dir" && cur) {                                  // resume 目录缺失询问
      if (key.escape) setMode({ k: "list" });
      else if ((key.return || input === "\n")) {
        const d = buf.trim();
        setMode({ k: "list" });
        if (d) {
          const t = d.startsWith("~") ? os.homedir() + d.slice(1)
            : pth.isAbsolute(d) ? d : pth.join(os.homedir(), d);
          const r = execResumeAt(cur, props.resumeCmd, t);
          process.exit(r.needDir ? 1 : (r.status ?? 0));
        }
      }
      else if (key.backspace || key.delete) setBuf((b) => b.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBuf((b) => b + input);
      return;
    }
    if (mode.k === "picker") {                                      // Tab 项目选择（整页替换实现 overlay 语义）
      const items = pickerItems();
      if (key.escape || input === "q" || (key.tab || input === "\t")) setMode({ k: "list" });
      else if ((key.return || input === "\n")) {
        const pick = items[pickerIdx];
        setProject(pick && pick[1] === null ? null : (pick ? pick[1] : null));
        setCursor(0); setMode({ k: "list" });
      }
      else if (input === "j" || key.downArrow) setPickerIdx((i) => Math.min(i + 1, items.length - 1));
      else if (input === "k" || key.upArrow) setPickerIdx((i) => Math.max(i - 1, 0));
      return;
    }

    // ---- 列表态 ----
    if (pager.open && cur) {                                        // o pager 独占
      const dls = detailLines(cur, W - 2);
      if (input === "j" || key.downArrow) setPager((p) => ({ ...p, off: p.off + 1 }));
      else if (input === "k" || key.upArrow) setPager((p) => ({ ...p, off: Math.max(0, p.off - 1) }));
      else if (input === " " || key.pageDown || key.pageUp || input === "b") {
        const step = Math.max(1, H - 2);
        setPager((p) => ({ ...p, off: key.pageUp ? Math.max(0, p.off - step) : p.off + step }));
      }
      else if (input === "g") setPager((p) => ({ ...p, off: 0 }));
      else if (input === "G") setPager((p) => ({ ...p, off: dls.length }));
      else if (input === "q" || key.escape) setPager({ open: false, off: 0 });
      return;
    }
    if (input === "q") { process.stdout.write("\x1b[2J\x1b[H"); process.exit(0); }
    else if (input === "j" || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, n - 1)));
    else if (input === "k" || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    else if (input === "g") setCursor(0);
    else if (input === "G" && n) setCursor(n - 1);
    else if (input === "/") { setQuery(""); setCursor(0); setMode({ k: "search" }); }
    else if ((key.tab || input === "\t")) { setPickerIdx(0); setMode({ k: "picker" }); }
    else if (key.pageUp) setDscroll((d) => Math.max(0, d - listH));
    else if (key.pageDown || input === "J") setDscroll((d) => d + listH);
    else if (input === "K") setDscroll((d) => Math.max(0, d - 1));
    else if (input === "o" && cur) setPager({ open: true, off: 0 });
    else if (input === "y" && cur) copyOut(cur.first_user);
    else if (input === "Y" && cur) copyOut(cur.last_reply);
    else if ((input === "r" || input === "R") && cur) { setBuf(""); setMode({ k: "rename" }); }   // R3-1: 空输入全名替换（Python 语义；预填现名会拼成"旧+新"）
    else if (input === "s" && cur) {
      if (!cur.sid) setMsg(T("no_sid"));
      else if (!startSummary(cur)) setMsg(T("sum_fail", { t: cur.title.slice(0, 24) }));
      else { setMsg(T("sum_started", { t: cur.title.slice(0, 24) })); keepMsg.current = true; }
    }
    else if ((key.ctrl && input === "l") || input === "\x1b[15~") { setSessions(scanAll()); setCursor((c) => Math.min(c, Math.max(0, n - 1))); }
    else if (input === "a" && cur && !archiveView) { try { doArchive(cur, ccsHome()); setSessions(scanAll()); setCursor((c) => Math.min(c, Math.max(0, n - 2))); } catch (e) { setMsg(T("op_fail", { e: String(e) })); } }
    else if (input === "u" && cur && archiveView) { try { doRestore(cur, paths()[0]); setSessions(scanAll()); setCursor((c) => Math.min(c, Math.max(0, n - 2))); } catch (e) { setMsg(T("op_fail", { e: String(e) })); } }
    else if (input === "d" && cur) { try { doTrash(cur, ccsHome()); setSessions(scanAll()); setCursor((c) => Math.min(c, Math.max(0, n - 2))); } catch (e) { setMsg(T("op_fail", { e: String(e) })); } }
    else if (input === "A") { setArchiveView((v) => !v); setQuery(""); setProject(null); setCursor(0); }
    else if ((key.return || input === "\n") && cur) {
      if (!cur.sid) { setMsg(T("no_sid")); }
      else {
      const r = execResume(cur, props.resumeCmd);
      if (r.needDir) { setBuf(""); setMode({ k: "dir" }); }
      else { process.stdout.write("\x1b[2J\x1b[H"); process.exit(r.status ?? 0); }
      }
    }
    else if (key.escape) { setQuery(""); setProject(null); setArchiveView(false); setCursor(0); }
  };
  useInput((raw: string, k: Parameters<typeof onKey>[1]) => {
    if (raw.length > 1 && /^[\x20-\x7e\u00a0-\uffff]+$/.test(raw)) {
      for (const ch of raw) onKey(ch, k);      // 纯可打印块（连击/粘贴）逐字符分发；含控制字符整包交原逻辑（分发链内 setState 异步，混控制符会读旧状态）
      return;
    }
    onKey(raw, k);
  });

  function copyOut(text: string): void {
    if (!text) { setMsg(T("no_copy")); return; }
    const b = copyBackend();
    if (!b) { setMsg(T("no_copy_tool")); return; }
    const body = b.encoding === "utf-16le"
      ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, b.encoding)])  // LE BOM（对齐 Python utf-16）
      : Buffer.from(text, b.encoding);
    const r = spawnSync(b.argv[0], b.argv.slice(1), { input: body });
    setMsg(r.status === 0 ? T("copied", { n: text.length }) : T("no_copy"));
  }

  function pickerItems(): [string, string | null, number, number][] {   // (显示名, cwd|null=全部, 会话数, 最新mtime)
    const agg = new Map<string, [number, number]>();
    for (const m of sessions) {
      if (m.archived !== archiveView) continue;
      const t = agg.get(m.cwd) || [0, 0];
      agg.set(m.cwd, [t[0] + 1, Math.max(t[1], m.mtime)]);
    }
    const rowsA = [...agg.entries()].sort((a, b) => b[1][1] - a[1][1]);
    const total = [...agg.values()].reduce((s, v) => s + v[0], 0);
    const newest = rowsA.length ? rowsA[0][1][1] : 0;
    return [[T("picker_all"), null, total, newest],
            ...rowsA.map(([c, v]) => [pth.basename(c) || c, c, v[0], v[1]] as [string, string | null, number, number])];
  }

  // ---- 详情行（Python _detail_lines 等价：字段4行 + bar + AI总结/首问/末答，mdLines 渲染） ----
  function detailLines(m: SessionMeta, width: number): { text: string; kind: "lab" | "val" | "dim" }[] {
    const sums = loadSummaries();
    const bar = { text: "-".repeat(Math.max(4, width)), kind: "dim" as const };
    const vw = Math.max(8, width - 6);               // R2-1: 值按栏宽截断——超长 sid/cwd 交 ink 自动换行会溢出次行
    const out: { text: string; kind: "lab" | "val" | "dim" }[] = [
      { text: pad(T("f_title"), 5) + cut(m.title, vw), kind: "lab" as const },
      { text: pad(T("f_project"), 5) + cut(tilde(m.cwd), vw), kind: "lab" as const },
      { text: pad(T("f_branch"), 5) + cut(m.branch || "-", vw) + `   ${Math.floor(m.size / 1024)} KB`, kind: "lab" as const },
      { text: pad(T("f_id"), 5) + cut(m.sid, vw), kind: "lab" as const },
    ];
    const s = sums[m.sid];
    if (s && s.text) {
      out.push(bar, { text: T("ai_summary"), kind: "lab" });
      for (const ln of mdLines(s.text, width)) out.push({ text: ln, kind: "val" });
    }
    out.push(bar, { text: T("first_q"), kind: "lab" });
    for (const ln of mdLines(m.first_user || T("none"), width)) out.push({ text: ln, kind: "val" });
    out.push(bar, { text: T("last_a"), kind: "lab" });
    for (const ln of mdLines(m.last_reply || T("none"), width)) out.push({ text: ln, kind: "val" });
    return out;
  }

  const acc = themeRef.current;

  // ---- too small ----
  if (H < 12 || W < 60) {
    return <Text>{T("too_small", { w: W, h: H })}</Text>;
  }

  // ---- pager 全屏（o） ----
  if (pager.open && cur) {
    const dls = detailLines(cur, W - 2);
    const poff = Math.max(0, Math.min(pager.off, Math.max(0, dls.length - (H - 2))));
    const shown = dls.slice(poff, poff + H - 2);
    return (
      <Box flexDirection="column" height={H}>
        <Box backgroundColor={acc.accent}>
          <Text color="black" bold>{` ${cut(cur.title, W - 14)}  [${poff + 1}/${dls.length}]`}</Text>
        </Box>
        {shown.map((l, i) => (
          <Text key={i} color={l.kind === "lab" ? acc.accent : l.kind === "dim" ? "gray" : undefined}>{l.text}</Text>
        ))}
        <Text backgroundColor={acc.accent} color="black">{cut(T("pager_hint"), W - 1)}</Text>
      </Box>
    );
  }

  // ---- picker 整页（Tab） ----
  if (mode.k === "picker") {
    const items = pickerItems();
    return (
      <Box flexDirection="column" height={H}>
        <Box borderStyle="round" flexDirection="column" paddingX={1}>
          <Text bold color={acc.accent}>{T("picker_t")}</Text>
          {items.map(([name, cwd, cnt, mt], i) => (
            <Box key={String(cwd) + i}>
              <Text backgroundColor={i === pickerIdx ? acc.accent : undefined}
                color={i === pickerIdx ? "black" : undefined}
                bold={i === pickerIdx}>
                {(i === pickerIdx ? "▸ " : "  ") + name + (cwd && cwd === project ? " *" : "")}
              </Text>
              <Text dimColor>{String(cnt).padStart(4)}  {relTime(mt, Date.now() / 1000)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  // ---- 主双栏布局 ----
  const LW = Math.min(60, Math.max(34, Math.floor(W / 2)));
  const RW = W - LW;
  const TOP = 1, BOT = H - 2 - nh;
  const listH = BOT - TOP - 1;                     // 表头占一行
  const visH = Math.max(1, listH);
  const _o0 = offRef.current;                      // 滞后窗口：cursor 在窗内 off 不动，出窗才滚
  const off = cursor < _o0 ? cursor : cursor >= _o0 + visH ? cursor - visH + 1 : _o0;
  offRef.current = off;
  const dls = cur ? detailLines(cur, RW - 2) : [];
  const dOff = Math.max(0, Math.min(dscroll, Math.max(0, dls.length - listH)));

  const badges =
    (archiveView ? T("badge_arch") : "")
    + (project ? T("badge_proj", { v: pth.basename(project) || project }) : "")
    + (query ? T("badge_q", { v: query }) : "");
  const statusLine = mode.k === "search"
    ? T("search_p") + query + "▌"
    : mode.k === "rename"
      ? T("rename_p", { t: (cur?.title || "").slice(0, 24) }) + buf
      : mode.k === "dir"
        ? T("gone_input", { p: cur?.cwd || "-" }) + buf
        : msg;

  return (
    <Box flexDirection="column" height={H}>
      {/* 顶栏 */}
      <Text backgroundColor={acc.accent} color="black" bold>{" " + T("title", { n }) + (badges ? ` ${badges}` : "") + " ".repeat(Math.max(1, W - 2 - dw(" " + T("title", { n }) + badges))) + `${n ? cursor + 1 : 0}/${n} `}</Text>
      <Box flexDirection="row">
        {/* 左栏：表头+列表 */}
        <Box flexDirection="column" width={LW} borderStyle="round" borderColor={acc.accent}>
          <Text dimColor>{T("hdr_cols")}</Text>
          {rows.slice(off, off + visH).map((m, j) => {
            const sel = off + j === cursor;
            const t = relTime(m.mtime);
            return (
              <Text key={m.path} backgroundColor={sel ? acc.accent : undefined}
                color={sel ? "black" : undefined}>{pad(t, 7) + " " + (sel ? cut(m.title, LW - 10) : cut(m.title, LW - 10))}</Text>
            );
          })}
        </Box>
        {/* 右栏：详情 */}
        <Box flexDirection="column" width={RW} borderStyle="round" borderColor={acc.accent}>
          <Text color={acc.accent}>{T("detail")}</Text>
          {dls.slice(dOff, dOff + listH).map((l, i) => (
            <Text key={i} color={l.kind === "lab" ? acc.accent : l.kind === "dim" ? "gray" : undefined}
              bold={l.kind === "lab"}>{l.text}</Text>
          ))}
        </Box>
      </Box>
      {/* 消息行 + 帮助行 */}
      <Text color={acc.msg} bold>{statusLine.slice(0, W - 1)}</Text>
      {helpLs.map((hl, i) => <Text key={i} dimColor>{hl.slice(0, W - 1)}</Text>)}
    </Box>
  );
}

export async function runTui(initialSessions: SessionMeta[], archiveView: boolean,
                       resumeCmd: string, theme: string, custom?: Record<string, unknown>): Promise<void> {
  harvestSummaries();
  const { render } = await import("ink");
  return new Promise((resolve) => {
    const inst = render(
      <CcsApp initialSessions={initialSessions} archiveView={archiveView}
        resumeCmd={resumeCmd} theme={theme} custom={custom} />, { exitOnCtrlC: false });
    // 退出由 q/Enter 触发 process.exit；兜底 unmount
    process.on("beforeExit", () => { inst.unmount(); resolve(); });
  });
}

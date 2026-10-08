/**
 * ccs Node 版 M5：AI 总结移植。
 * summaries.json 与 Python 版互读（同键同结构）；写走 tmp+rename。
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta } from "./parse.js";
import { ccsHome } from "./config.js";

/** key -> {proc, out, title, kind}；kind: "summary" | "semantic"；随进程退出即弃。 */
export interface Job {
  proc: ReturnType<typeof spawn>;
  out: string;
  title: string;
  kind?: "summary" | "semantic";
}
export const JOBS = new Map<string, Job>();

/** 语义候选：默认限最近 15 天；查询自带时间范围（N天/日/周/月/hour/day/week/month）则信任用户表达。 */
export function semanticCandidates(sessions: SessionMeta[], q: string): SessionMeta[] {
  if (/\d+\s*(天|日|周|月|小时|个?月|hour|day|week|month)/.test(q)) return sessions.slice(0, 100);
  const cut = Date.now() / 1000 - 15 * 86400;
  return sessions.filter((m) => m.mtime >= cut).slice(0, 100);
}

export function buildSemanticArgv(sessions: SessionMeta[], q: string): string[] {
  const cands = semanticCandidates(sessions, q);
  const window = cands.length < Math.min(sessions.length, 100) || !sessions.length ? "（范围：最近 15 天）" : "";
  const items = cands.map((m) => ({
    sid: m.sid,
    title: m.title.slice(0, 80),
    cmds: (m.all_cmds && m.all_cmds.length ? m.all_cmds : [...m.first_cmds, ...m.last_cmds]).slice(0, 6).join(" / ").slice(0, 300),
  }));
  const prompt = ("你是会话检索器。下面是 Claude Code 会话清单(JSON)。找出与查询语义最相关的会话"
    + "（最多 20 个，宁缺毋滥）。只输出 JSON 字符串数组（元素=sid），不要任何其他文字。"
    + window + "\n清单: " + JSON.stringify(items) + "\n查询: " + q);
  return ["claude", "-p", prompt];
}

export function startSemantic(sessions: SessionMeta[], q: string): boolean {
  const d = path.join(ccsHome(), "summarize");
  fs.mkdirSync(d, { recursive: true });
  const outp = path.join(d, "semantic.out");
  const argv = buildSemanticArgv(sessions, q);
  try {
    const fd = fs.openSync(outp, "w");
    const proc = spawn(argv[0], argv.slice(1), { stdio: ["ignore", fd, "ignore"] });
    fs.closeSync(fd);                                 // spawn 已 dup，父侧关闭（R4-1 同课）
    JOBS.set("__semantic__", { proc, out: outp, title: q.slice(0, 24), kind: "semantic" });
    return true;
  } catch { return false; }
}

export function summariesPath(): string {
  return path.join(ccsHome(), "summaries.json");
}

export function loadSummaries(): Record<string, { text: string; ts: number }> {
  try {
    const v = JSON.parse(fs.readFileSync(summariesPath(), "utf-8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveSummaries(sums: Record<string, { text: string; ts: number }>): void {
  const tmp = `${summariesPath()}.${process.pid}.tmp`;   // R2-2: pid 隔离——双开 ccs 并发写不互踩 rename
  fs.writeFileSync(tmp, JSON.stringify(sums), "utf-8");   // Python: ensure_ascii=False
  fs.renameSync(tmp, summariesPath());
}

/** prompt 从 Python build_summary_argv 逐字复制。 */
export function buildSummaryArgv(m: SessionMeta): string[] {
  const prompt =
    `请读取并分析这个 Claude Code 会话记录文件：${m.path}（sessionId=${m.sid}）。` +
    "输出（中文 Markdown，简洁分节）：" +
    "1) 会话/需求的所有核心目标；" +
    "2) 整体任务工作计划与进度百分比；" +
    "3) 当前代码分支状态；" +
    "4) 本会话解决了哪些问题，列出问题清单。";
  return ["claude", "-p", prompt, "--allowedTools", "Read"];
}

export function startSummary(m: SessionMeta): boolean {
  const d = path.join(ccsHome(), "summarize");
  fs.mkdirSync(d, { recursive: true });
  const outp = path.join(d, `${m.sid}.out`);
  try {
    const fd = fs.openSync(outp, "w");
    const argv = buildSummaryArgv(m);
    const proc = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", fd, "ignore"],
      cwd: m.cwd || undefined,
    });
    fs.closeSync(fd);   // R4-1: spawn 已 dup fd，父进程侧必须关闭——否则每次 s 键泄 1 个 fd
    proc.unref();
    JOBS.set(m.sid, { proc, out: outp, title: m.title });
    return true;
  } catch {
    return false;
  }
}

export interface SumEvent { sid: string; ok: boolean; title: string; kind?: "summary" | "semantic"; sids?: string[] }

/** 收割退出进程：rc==0 且有输出 → summaries.json（text≤20000）。返回事件供 TUI 显示。 */
export function pollJobs(): SumEvent[] {
  const events: SumEvent[] = [];
  for (const [sid, jb] of [...JOBS.entries()]) {
    if (jb.proc.exitCode === null && jb.proc.signalCode === null) continue;
    JOBS.delete(sid);
    let out = "";
    try {
      out = fs.readFileSync(jb.out, "utf-8").trim();
    } catch { /* OSError → "" */ }
    const ok = jb.proc.exitCode === 0 && out.length > 0;
    if (jb.kind === "semantic") {                     // 语义任务：输出 [..sid..] JSON 数组，不落 summaries
      const sids: string[] = [];
      if (ok) {
        const lo = out.indexOf("["), hi = out.lastIndexOf("]");
        if (lo >= 0 && hi > lo) {
          try {
            const v = JSON.parse(out.slice(lo, hi + 1));
            if (Array.isArray(v)) sids.push(...v.filter((x) => typeof x === "string"));
          } catch { /* 容忍模型夹带杂文 */ }
        }
      }
      events.push({ sid, ok: sids.length > 0, title: jb.title, kind: "semantic", sids });
      continue;
    }
    if (ok) {
      const sums = loadSummaries();
      sums[sid] = { text: out.slice(0, 20000), ts: Date.now() / 1000 };
      saveSummaries(sums);
    }
    events.push({ sid, ok, title: jb.title });
  }
  return events;
}

/** 收编孤儿输出（ccs 中途退出后 claude 仍写完 .out）；跳过 maxAge 秒内新文件防误收。 */
export function harvestSummaries(maxAgeSec = 120): void {
  const d = path.join(ccsHome(), "summarize");
  let names: string[];
  try {
    names = fs.readdirSync(d);
  } catch {
    return;
  }
  let sums: Record<string, { text: string; ts: number }> | null = null;
  for (const fn of names) {
    if (!fn.endsWith(".out")) continue;
    const p = path.join(d, fn);
    let st;
    try {
      st = fs.statSync(p);
    } catch { continue; }
    if (Date.now() / 1000 - st.mtimeMs / 1000 < maxAgeSec) continue;
    let out = "";
    try {
      out = fs.readFileSync(p, "utf-8").trim();
    } catch { continue; }
    if (out) {
      if (sums === null) sums = loadSummaries();
      sums[fn.slice(0, -4)] = { text: out.slice(0, 20000), ts: st.mtimeMs / 1000 };
    }
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  if (sums !== null) saveSummaries(sums);
}

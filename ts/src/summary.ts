/**
 * ccs Node 版 M5：AI 总结移植。
 * summaries.json 与 Python 版互读（同键同结构）；写走 tmp+rename。
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta } from "./parse.js";
import { ccsHome } from "./config.js";

/** sid -> {proc, out, title}；随进程退出即弃，孤儿输出由 harvest 兜底。 */
export interface Job {
  proc: ReturnType<typeof spawn>;
  out: string;
  title: string;
}
export const JOBS = new Map<string, Job>();

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
  const tmp = summariesPath() + ".tmp";
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
    proc.unref();
    JOBS.set(m.sid, { proc, out: outp, title: m.title });
    return true;
  } catch {
    return false;
  }
}

export interface SumEvent { sid: string; ok: boolean; title: string }

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

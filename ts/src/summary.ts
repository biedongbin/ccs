/**
 * ccs Node 版 M5：AI 总结移植。
 * summaries.json 与 Python 版互读（同键同结构）；写走 tmp+rename。
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta } from "./parse.js";
import { ccsHome } from "./config.js";

/** key -> {proc, out, title, kind}；summary 作业跨 ccs 退出存活（detached + pid.t0 自描述）。 */
export interface Job {
  proc: ReturnType<typeof spawn> | null;   // null = 收养的作业（非本会话 spawn）
  out: string;
  title: string;
  kind?: "summary" | "semantic";
  conv?: string;
  t0?: number;
  pid?: number;
  done?: boolean;
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
    cmds: [...(m.first_cmds || []), ...(m.last_cmds || [])].slice(0, 6).join(" / ").slice(0, 300),   // 对齐 Python：首尾指令域（原 all_cmds，背离）
  }));
  const prompt = ("你是会话检索器。下面是 Claude Code 会话清单(JSON)。找出与查询语义最相关的会话"
    + "（最多 20 个，宁缺毋滥）。只输出 JSON 字符串数组（元素=sid），不要任何其他文字。"
    + window + "\n清单: " + JSON.stringify(items) + "\n查询: " + q);
  return ["claude", "-p", prompt, "--allowedTools", "Read"];   // D2: 与 summary 同收紧工具面
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
export const SUMMARY_TIMEOUT = 400;          // 兜底上限（秒）
export const EXPECTED_BYTES = 4000;          // 进度估算基准
export const STDIN_MAX = 8 * 1024 * 1024;    // claude -p stdin 硬上限 10MB，留余量

const SUMMARY_ASK =
  "请据此输出中文 Markdown（简洁分节）：" +
  "1) 会话/需求的所有核心目标；" +
  "2) 整体任务工作计划与进度百分比；" +
  "3) 当前代码分支状态；" +
  "4) 本会话解决了哪些问题，列出问题清单。";

/** prompt 从 Python SUMMARY_PROMPT 逐字复制。 */
export const SUMMARY_PROMPT =
  "以下是某个 Claude Code 会话的完整对话流（含用户指令、助手思考、工具调用与结果）。" + SUMMARY_ASK;

export function buildSummaryArgv(): string[] {
  return ["claude", "-p", SUMMARY_PROMPT,
    "--output-format", "stream-json", "--include-partial-messages", "--verbose"];
}

/** 大对话流（>8MB，超 stdin 上限）改走文件路径 + Read 工具。 */
export function buildSummaryFileArgv(convPath: string): string[] {
  return ["claude", "-p", `请读取并分析这个对话流文件：${convPath}。` + SUMMARY_ASK,
    "--allowedTools", "Read",
    "--output-format", "stream-json", "--include-partial-messages", "--verbose"];
}

/** 把 .jsonl 压成纯对话流（仅 user/assistant 的 message），零失真剥离元数据信封。 */
export function writeConvStream(src: string, dst: string): boolean {
  try {
    const lines = fs.readFileSync(src, "utf-8").split("\n");
    const out: string[] = [];
    for (const line of lines) {
      if (!line) continue;
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      if (!o || typeof o !== "object") continue;
      if (o.type !== "user" && o.type !== "assistant") continue;
      if (o.isSidechain) continue;
      const m = o.message;
      if (!m || typeof m !== "object") continue;
      out.push(JSON.stringify({ role: m.role, content: m.content }));
    }
    fs.writeFileSync(dst, out.join("\n"), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** 解析 stream-json 输出：(最终文本|null, 已产出字节数, 是否见 result)。半截输出不抛错。 */
export function parseStreamOut(p: string): [string | null, number, boolean] {
  let text: string | null = null;
  let produced = 0;
  let sawResult = false;
  let raw = "";
  try { raw = fs.readFileSync(p, "utf-8"); } catch { return [null, 0, false]; }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || typeof o !== "object") continue;
    if (o.type === "result") {
      sawResult = true;
      if (typeof o.result === "string") text = o.result;
    } else if (o.type === "stream_event") {
      const d = o.event?.delta;
      if (d?.type === "text_delta" && typeof d.text === "string") produced += d.text.length;
    }
  }
  return [text, produced, sawResult];
}

/** (已运行秒数, 估算百分比)。 */
export function jobProgress(jb: Job): [number, number] {
  const t0 = jb.t0 || 0;
  const el = t0 ? Math.floor(Date.now() / 1000 - t0) : 0;
  const [, produced] = parseStreamOut(jb.out);
  const pct = jb.done ? 100 : Math.min(95, Math.floor((produced * 100) / EXPECTED_BYTES));
  return [el, pct];
}

export function hasActiveJobs(): boolean {
  return JOBS.size > 0;
}

export function startSummary(m: SessionMeta): boolean {
  const d = path.join(ccsHome(), "summarize");
  fs.mkdirSync(d, { recursive: true });
  const t0 = Math.floor(Date.now() / 1000);
  const conv = path.join(d, `${m.sid}.conv`);
  if (!writeConvStream(m.path, conv)) return false;
  const outp = path.join(d, `${m.sid}.${process.pid}.${t0}.out`);   // 自描述 sid.pid.t0.out
  try {
    const big = fs.statSync(conv).size > STDIN_MAX;   // 超 stdin 上限 → 走文件路径 + Read
    const fdOut = fs.openSync(outp, "w");
    const fdIn = big ? fs.openSync("/dev/null", "r") : fs.openSync(conv, "r");
    const argv = big ? buildSummaryFileArgv(conv) : buildSummaryArgv();
    const proc = spawn(argv[0], argv.slice(1), {
      stdio: [fdIn, fdOut, "ignore"],
      cwd: m.cwd || undefined,
      detached: true,               // start_new_session 等价：脱离会话，ccs 退出不被 SIGHUP 连带
    });
    fs.closeSync(fdIn);
    fs.closeSync(fdOut);            // spawn 已 dup fd，父侧必须关闭
    proc.unref();
    JOBS.set(m.sid, { proc, out: outp, conv, title: m.title, t0, pid: proc.pid });
    return true;
  } catch {
    try { fs.unlinkSync(conv); } catch { /* ignore */ }
    return false;
  }
}

function finishJob(sid: string, jb: Job): boolean {
  const [text] = parseStreamOut(jb.out);
  const ok = !!text;
  if (ok) {
    const sums = loadSummaries();
    sums[sid] = { text: text!.slice(0, 20000), ts: Date.now() / 1000 };
    saveSummaries(sums);
  }
  for (const p of [jb.out, jb.conv]) {
    if (p) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  }
  return ok;
}

/** 启动收养：扫 *.out 解析 sid.pid.t0；pid 存活→注册续显，已死→收编，超时→kill。 */
export function adoptJobs(): void {
  const d = path.join(ccsHome(), "summarize");
  let names: string[];
  try { names = fs.readdirSync(d); } catch { return; }
  const now = Date.now() / 1000;
  for (const fn of names) {
    if (!fn.endsWith(".out") || fn === "semantic.out") continue;
    const parts = fn.slice(0, -4).split(".");
    if (parts.length < 3) continue;
    const t0s = parts.pop()!, pids = parts.pop()!, sid = parts.join(".");
    const pid = Number(pids), t0 = Number(t0s);
    if (!Number.isFinite(pid) || !Number.isFinite(t0)) continue;
    const outp = path.join(d, fn);
    const conv = path.join(d, `${sid}.conv`);
    const jb: Job = { proc: null, out: outp, conv, title: sid, t0, pid };
    const saw = parseStreamOut(outp)[2];
    if (saw) {                                        // 已见 result：结果完整，直接收编
      finishJob(sid, jb);
    } else if (now - t0 > SUMMARY_TIMEOUT) {          // 无 result 且超时：kill 并清
      try { process.kill(pid, "SIGKILL"); } catch { /* ignore */ }
      for (const p of [outp, conv]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
    } else if (pidAlive(pid)) {
      JOBS.set(sid, jb);                              // 仍在跑：续显
    } else {
      finishJob(sid, jb);
    }
  }
}

export interface SumEvent { sid: string; ok: boolean; title: string; kind?: "summary" | "semantic"; sids?: string[] }

/** 收割退出进程：rc==0 且有输出 → summaries.json（text≤20000）。返回事件供 TUI 显示。 */
export function pollJobs(): SumEvent[] {
  const events: SumEvent[] = [];
  const now = Date.now() / 1000;
  for (const [sid, jb] of [...JOBS.entries()]) {
    // 结束判定：本会话 spawn 用 exitCode/signalCode；收养作业用 result 事件（僵尸 pid 仍"存活"不可靠）
    const done = jb.proc !== null
      ? jb.proc.exitCode !== null || jb.proc.signalCode !== null
      : parseStreamOut(jb.out)[2];
    const timedOut = now - (jb.t0 || now) > SUMMARY_TIMEOUT;
    if (!done && !timedOut) continue;
    JOBS.delete(sid);
    if (timedOut && !done) {                        // 兜底：超时 kill
      try { process.kill(jb.pid!, "SIGKILL"); } catch { /* ignore */ }
    }
    if (jb.kind === "semantic") {                   // 语义任务：输出 [..sid..] JSON 数组，不落 summaries
      let out = "";
      try { out = fs.readFileSync(jb.out, "utf-8").trim(); } catch { /* ignore */ }
      const sids: string[] = [];
      if (out) {
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
    const ok = timedOut ? false : finishJob(sid, jb);
    events.push({ sid, ok, title: jb.title });
  }
  return events;
}

/** 兼容旧签名：委托 adoptJobs（旧 .out 无 pid.t0 后缀，按 mtime 收编）。 */
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
    if (!fn.endsWith(".out") || fn === "semantic.out") continue;
    if (fn.slice(0, -4).split(".").length >= 3) continue;   // 新式自描述：交给 adoptJobs
    const p = path.join(d, fn);
    let st;
    try {
      st = fs.statSync(p);
    } catch { continue; }
    if (Date.now() / 1000 - st.mtimeMs / 1000 < maxAgeSec) continue;
    const [txt] = parseStreamOut(p);
    let out = txt ?? "";
    if (!out) {
      try { out = fs.readFileSync(p, "utf-8").trim(); } catch { continue; }
    }
    if (out) {
      if (sums === null) sums = loadSummaries();
      sums[fn.slice(0, -4)] = { text: out.slice(0, 20000), ts: st.mtimeMs / 1000 };
    }
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  if (sums !== null) saveSummaries(sums);
}

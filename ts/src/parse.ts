/**
 * ccs Node 原生版 M1：Python 解析层逐语义移植。
 * 期望值一律以 Python 现行为准（python3 tools/dump_py.py → ts/test/parity_py.json）。
 */
import * as fs from "fs";
import * as path from "path";

const SEP = path.sep; // posix "/"

export const INTERNAL_PREFIXES = [
  "Below is a conversation log",
  "Caveat: The messages below",
  "Base directory for this skill",   // skill 展开注入的 user 行，非真人指令
  "<local-command",
  "This session is being continued",
  "<command-name>",
  "<command-message>",
  "<command-args>",
] as const;

export interface SessionMeta {
  sid: string;
  title: string;
  cwd: string;
  branch: string;
  mtime: number;
  size: number;
  path: string;
  first_user: string;
  last_reply: string;
  first_cmds: string[];   // 用户指令前3（采样窗内，对齐 Python v16）
  last_cmds: string[];    // 用户指令后3
  all_cmds: string[];     // 全量用户指令域（≤80 条×200 字符）：内容搜索（v20）
  summary: string;
  archived: boolean;
  entrypoint: string;
  custom_title: string;
  ai_title: string;
}

export type Parsed =
  | { kind: "meta"; meta: SessionMeta }
  | { kind: "sidecar"; leaf: string; summary: string }
  | { kind: "none" };

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is Record<string, unknown> =>
        !!b && typeof b === "object" && b.type === "text")
      .map(b => (typeof b.text === "string" ? b.text : ""))
      .join("\n");
  }
  return "";
}

export function isInternal(text: string): boolean {
  return INTERNAL_PREFIXES.some(p => text.startsWith(p));
}

/** 近似 Python bytes.splitlines：按 \n 切、行尾剥 \r（孤立 \r 不切——jsonl 实践无此分隔）。 */
function splitLines(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      let end = i;
      if (end > start && buf[end - 1] === 0x0d) end--;
      out.push(buf.subarray(start, end));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start)); // 尾随分隔符不产空尾行（对齐 bytes.splitlines）
  return out;
}

export function parseJsonl(p: string, budget = 65536): Parsed {
  let st: fs.Stats;
  let head: Buffer;
  let tail: Buffer;
  try {
    st = fs.statSync(p);
    const fd = fs.openSync(p, "r");
    try {
      head = Buffer.alloc(Math.min(budget, st.size));
      fs.readSync(fd, head, 0, head.length, 0);
      const tailStart = Math.max(0, st.size - budget);
      tail = Buffer.alloc(st.size - tailStart);
      fs.readSync(fd, tail, 0, tail.length, tailStart);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { kind: "none" };
  }
  const meta: SessionMeta = {
    sid: "", title: "", cwd: "", branch: "",
    mtime: st.mtimeMs / 1000, size: st.size, path: p,   // Python st_mtime 为秒
    first_user: "", last_reply: "", summary: "", first_cmds: [], last_cmds: [], all_cmds: [],
    archived: false, entrypoint: "", custom_title: "", ai_title: "",
  };
  let firstUser = "";
  let lastReply = "";
  const cmds: string[] = [];            // head 段指令：前3（v17 分段收集，重叠区不重复）
  const cmdsTail: string[] = [];        // tail 段指令：后3
  const cmdsAcc: string[] = [];         // tail 窗内全量指令（并入 all_cmds）
  let sawContent = false;
  let nlines = 0;

  const feed = (line: Buffer, part: "head" | "tail" = "head"): void => {
    let o: any;
    try {
      o = JSON.parse(line.toString("utf8"));
    } catch {
      return;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    const t = o.type;
    if (t === "summary") {
      if (!meta.summary && o.summary) meta.summary = String(o.summary);
      if ("leafUuid" in o) return; // 纯 sidecar 由下方终检判定
    }
    if (!meta.sid && o.sessionId) meta.sid = o.sessionId;
    if (!meta.cwd && o.cwd) meta.cwd = o.cwd;
    if (!meta.branch && o.gitBranch) meta.branch = o.gitBranch;
    if (!meta.entrypoint && o.entrypoint) meta.entrypoint = String(o.entrypoint);
    if (t === "ai-title" && o.aiTitle) meta.ai_title = String(o.aiTitle);
    if (t === "custom-title" && o.customTitle) meta.custom_title = String(o.customTitle);
    const msg = o.message;
    const content = msg && typeof msg === "object" ? msg.content : undefined;
    if (t === "user" && !o.isSidechain) {
      const txt = textOf(content).trim();
      if (txt && !isInternal(txt)) {
        sawContent = true;
        if (part === "head") cmds.push(txt);
        else {
          cmdsTail.push(txt);
          cmdsAcc.push(txt);
        }
        if (!firstUser) firstUser = txt;
      }
    } else if (t === "assistant") {
      const txt = textOf(content).trim();
      if (txt) {
        sawContent = true;
        lastReply = txt;
      }
    }
  };

  for (const line of splitLines(head)) {
    feed(line, "head");
    nlines++;
  }
  for (const line of splitLines(tail)) feed(line, "tail");

  // 纯 summary sidecar：只有一行且是 summary（feed 里 leafUuid 行被 return，直接重查）
  if (nlines <= 1 && head.toString("latin1").replace(/ /g, "").includes('"type":"summary"')) {
    try {
      const o = JSON.parse(splitLines(head)[0].toString("utf8"));
      if (o && typeof o === "object" && o.type === "summary" && !sawContent) {
        return { kind: "sidecar", leaf: o.leafUuid ?? "", summary: String(o.summary ?? "") };
      }
    } catch {
      /* fallthrough */
    }
  }

  if (!firstUser || !cmds.length || !cmdsTail.length) {   // 任一侧缺失即全扫（尾部常被 AI 输出占满）
    // 兜底：真实首问/指令在头尾采样窗外（compact 续接样板挤占头部）→ 流式全扫
    const fullCmds: string[] = [];
    try {
      const fd = fs.openSync(p, "r");
      try {
        const buf = Buffer.alloc(1024 * 64);
        let carry: Buffer = Buffer.alloc(0);
        for (;;) {
          const n = fs.readSync(fd, buf, 0, buf.length, null);
          if (n === 0) break;
          const chunk = Buffer.concat([carry, buf.subarray(0, n)]);
          const lines = splitLines(chunk);
          carry = lines.pop() as Buffer; // 末段可能不完整，留待下一块
          for (const line of lines) {
            let o: any;
            try {
              o = JSON.parse(line.toString("utf8"));
            } catch {
              continue;
            }
            if (!o || typeof o !== "object" || Array.isArray(o)) continue;
            if (o.type !== "user" || o.isSidechain) continue;
            const txt = textOf(o.message?.content).trim();
            if (txt && !isInternal(txt)) {
              fullCmds.push(txt);                     // 全序收集：前3+后3（不 break）
              sawContent = true;
              if (!firstUser) firstUser = txt;
            }
          }
        }
        if (carry.length && !firstUser) {          // 末段无尾换行也过一遍（Python 逐行迭代语义）
          let o: any;
          try {
            o = JSON.parse(carry.toString("utf8"));
          } catch {
            o = null;
          }
          if (o && typeof o === "object" && !Array.isArray(o)
              && o.type === "user" && !o.isSidechain) {
            const txt = textOf(o.message?.content).trim();
            if (txt && !isInternal(txt)) {
              fullCmds.push(txt);
              sawContent = true;
              if (!firstUser) firstUser = txt;
            }
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      /* ignore */
    }
    if (!cmds.length) cmds.push(...fullCmds.slice(0, 3));          // 全扫兜底回填（采样窗内已有则不覆盖）
    if (!cmdsTail.length) cmdsTail.push(...fullCmds.slice(-3));
    if (!cmdsAcc.length) cmdsAcc.push(...fullCmds);                 // 兜底结果也进全量域
  }

  const chain = [
    meta.custom_title.slice(0, 80),
    meta.ai_title.slice(0, 80),
    meta.summary.slice(0, 80),
    firstUser.slice(0, 80),
    path.basename(p).replace(/\.jsonl$/, ""),
  ];
  meta.title = (chain.find(Boolean) ?? "")
    .replace(/\s+/g, " ")
    .trim() || "(空会话)";
  meta.first_user = firstUser.slice(0, 500);
  meta.last_reply = lastReply.slice(0, 4000);
  meta.first_cmds = cmds.slice(0, 3).map((c) => c.slice(0, 200));
  meta.last_cmds = cmdsTail.slice(-3).map((c) => c.slice(0, 200));
  {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const c of [...cmds, ...cmdsAcc]) {
      if (!seen.has(c)) {
        seen.add(c);
        merged.push(c);
      }
    }
    meta.all_cmds = merged.slice(0, 80).map((c) => c.slice(0, 200));
  }

  const enc = path.basename(path.dirname(p));
  const cwd0 = launchDir(enc, meta.cwd) || meta.cwd;
  meta.cwd = cwd0 ? realpath(cwd0) : "";
  return { kind: "meta", meta };
}

function realpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p; // Python realpath 非 strict：不存在时原样返回
  }
}

/** Python re.sub(r"[^A-Za-z0-9]+", "-", p) */
export function encPath(p: string): string {
  return p.replace(/[^A-Za-z0-9]+/g, "-");
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function joinSep(a: string, b: string): string {
  return a ? a + SEP + b : b;
}

/** 编码目录名反推真实启动目录：hint 祖先链消歧 + 文件系统贪心解码。 */
export function launchDir(encoded: string, hint = ""): string {
  if (hint) {
    let d = path.resolve(hint);
    for (;;) {
      if (encPath(d) === encoded) return d;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  const parts = encoded.split("-").filter(Boolean);
  if (!encoded.startsWith("-")) return "";
  let cur = "";
  while (parts.length) {
    let matched = false;
    for (let k = parts.length; k >= 1; k--) {
      const name = parts.slice(0, k).join("-");
      if (isDir(joinSep(SEP, joinSep(cur, name)))) {
        cur = joinSep(cur, name);
        parts.splice(0, k);
        matched = true;
        break;
      }
    }
    if (!matched) {
      cur = joinSep(cur, parts.join("/"));
      parts.length = 0;
    }
  }
  return SEP + cur;
}

/** archive/<encoded>/<file> → encoded 项目目录名。 */
export function encodedDirName(p: string, projectsDir: string): string {
  const dir = path.dirname(p);
  if (dir.startsWith(projectsDir)) {
    const rest = dir.slice(path.resolve(projectsDir).length).replace(/^\/+/, "");
    return rest ? rest.split(SEP)[0] : path.basename(dir);
  }
  return path.basename(dir);
}

/** 全量扫描（无缓存旁路）：sidecar 折叠、sdk-cli 过滤、sidecar 标题覆盖、mtime 降序。 */
export function scanProjects(projectsDir: string, archiveDir: string): SessionMeta[] {
  const entries: Array<{ f: string; archived: boolean }> = [];
  const roots = [...new Set([projectsDir, archiveDir])];
  for (const d of roots) {
    if (!isDir(d)) continue;
    const files = fs.readdirSync(d)
      .filter(f => f.endsWith(".jsonl") && fs.statSync(path.join(d, f)).isFile())
      .sort();
    for (const f of files) entries.push({ f: path.join(d, f), archived: d === archiveDir });
  }
  const metas: SessionMeta[] = [];
  const sidecars: Array<{ leaf: string; summary: string }> = [];
  for (const { f, archived } of entries) {
    let st: fs.Stats;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    void st;
    const r = parseJsonl(f);
    if (r.kind === "sidecar") {
      sidecars.push({ leaf: r.leaf, summary: r.summary });
      continue;
    }
    if (r.kind === "none") continue;
    r.meta.archived = archived;
    if (r.meta.entrypoint === "sdk-cli") continue;
    metas.push(r.meta);
  }
  const titles = new Map(sidecars.filter(s => s.leaf).map(s => [s.leaf, s.summary]));
  for (const m of metas) {
    const t = m.sid ? titles.get(m.sid) : undefined;
    if (t && !m.custom_title && !m.ai_title) {
      m.title = t.slice(0, 80).replace(/\s+/g, " ").trim();   // summary 非空且无 custom/ai 才覆盖
    }
  }
  return metas.sort((a, b) => b.mtime - a.mtime);
}

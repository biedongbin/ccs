/**
 * ccs Node 版缓存层（对齐 Python Cache：键 v{N}|path|mtime_ns，值=解析字段包）。
 * 与 Python 版同盘互读：Python 写的 cache.json Node 直接命中，反之亦然。
 */
import * as fs from "fs";
import * as path from "path";
import type { SessionMeta } from "./parse.js";

export const CACHE_VERSION = 20;

/** 与 Python _CACHE_FIELDS 同名单。 */
const FIELDS = ["sid", "title", "cwd", "branch", "first_user", "last_reply",
  "entrypoint", "first_cmds", "last_cmds", "all_cmds"] as const;

function pick(m: SessionMeta): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of FIELDS) o[f] = m[f];
  return o;
}

export class CcsCache {
  data: Record<string, Record<string, unknown>> = {};
  constructor(public file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });   // 首跑先建 ~/.ccs（对齐 Python Cache.__init__）
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch { /* 首跑无文件 */ }
  }
  get(key: string): Record<string, unknown> | null {
    const v = this.data[key];
    return v && typeof v === "object" ? v : null;
  }
  put(m: SessionMeta, mtimeNs: bigint): void {
    this.data[`v${CACHE_VERSION}|${m.path}|${mtimeNs}`] = pick(m);
  }
  /** 保存即修剪：文件消失 / mtime 已变（含版本更替）的键永不命中，一律裁掉。 */
  save(): void {
    const live: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(this.data)) {
      const parts = k.split("|", 3);
      if (parts.length !== 3) continue;
      try {
        const ns = fs.statSync(parts[1], { bigint: true }).mtimeNs;   // bigint stat 才有 ns 字段
        if (`v${CACHE_VERSION}|${parts[1]}|${ns}` === k) live[k] = v;
      } catch { /* 文件已消失 */ }
    }
    this.data = live;
    const tmp = this.file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data), "utf-8");
    fs.renameSync(tmp, this.file);
  }
}

/** 缓存命中 → SessionMeta（未缓存的 summary/custom_title/ai_title 留空，对齐 Python **hit 构造）。 */
export function metaFromCache(f: string, st: fs.Stats, archived: boolean,
  hit: Record<string, unknown>): SessionMeta {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const a = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    sid: s(hit.sid), title: s(hit.title), cwd: s(hit.cwd), branch: s(hit.branch),
    mtime: st.mtimeMs / 1000, size: st.size, path: f,
    first_user: s(hit.first_user), last_reply: s(hit.last_reply),
    first_cmds: a(hit.first_cmds), last_cmds: a(hit.last_cmds), all_cmds: a(hit.all_cmds),
    summary: "", archived,
    entrypoint: s(hit.entrypoint), custom_title: s(hit.custom_title), ai_title: s(hit.ai_title),
  };
}

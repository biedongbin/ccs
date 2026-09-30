/**
 * ccs Node 版 M4：恢复执行移植。
 * Python 语义：resume_cmd 一律交用户交互 shell（which 探测不可靠：
 * macOS /usr/bin/cc=clang 遮蔽 zshrc 的 cc() 函数）。
 * Python os.execvp 接管不返回 → Node: spawnSync 继承 stdio + exitCode 透传。
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import type { SessionMeta } from "./parse.js";
import { resumeCmdFull } from "./config.js";

/** Windows 分支：shlex 风格拆分（与 Python os.name=="nt" 分支一致）。 */
export function splitLikeShlex(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let dq = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (dq) {
      if (ch === '"') { dq = false; continue; }
      cur += ch;
    } else if (ch === '"') {
      dq = true;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) { out.push(cur); cur = ""; has = false; }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

export function buildResumeArgv(cmd: string, sid: string): string[] {
  if (process.platform === "win32") {
    return splitLikeShlex(resumeCmdFull(cmd).replace("{sid}", sid));
  }
  const sh = process.env.SHELL || "/bin/sh";
  return [sh, "-ic", resumeCmdFull(cmd).replace("{sid}", sid)];
}

export type ResumeResult =
  | { needDir: true; meta: SessionMeta }
  | { needDir: false; status: number | null };

/** 目录健在即原地执行；缺失返回 needDir（询问交互属 TUI 层）。 */
export function execResume(meta: SessionMeta, cmd: string): ResumeResult {
  if (!meta.sid) throw new Error("no sid");
  const cwd = meta.cwd && fs.existsSync(meta.cwd) ? meta.cwd : null;
  if (!cwd) return { needDir: true, meta };
  return execResumeAt(meta, cmd, cwd);
}

/** 指定目录执行（不存在则 mkdir，对应 Python makedirs 分支）。 */
export function execResumeAt(meta: SessionMeta, cmd: string, dir: string): ResumeResult {
  fs.mkdirSync(dir, { recursive: true });
  if (process.cwd() !== dir) process.chdir(dir);
  const argv = buildResumeArgv(cmd, meta.sid);
  const sub = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
  return { needDir: false, status: sub.error ? 1 : sub.status };   // 坏 SHELL 等 spawn 失败：退出码 1，不假成功
}

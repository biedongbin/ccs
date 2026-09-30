/** 全量扫描聚合（等价 Python scan：projects/* + archive/* 合并、archived 前缀判定、mtime 降序）。 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionMeta, scanProjects } from "./parse.js";
import { paths } from "./store.js";

function subDirs(base: string): string[] {
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return [];
  return fs.readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory())
    .map((d) => path.join(base, d));
}

export function scanAll(): SessionMeta[] {
  const [projects, home] = paths();
  const metas: SessionMeta[] = [];
  for (const d of [...subDirs(projects), ...subDirs(path.join(home, "archive"))]) {
    metas.push(...scanProjects(d, d));
  }
  const archPrefix = path.join(home, "archive") + path.sep;
  for (const m of metas) m.archived = m.path.startsWith(archPrefix);
  metas.sort((a, b) => b.mtime - a.mtime);
  return metas;
}

/** 等价 Python do_rename：追加 custom-title 行 + utimes 恢复 mtime（防列表跳顶）。 */
export function doRename(m: SessionMeta, name: string): boolean {
  try {
    const st = fs.statSync(m.path);
    fs.appendFileSync(m.path,
      JSON.stringify({ type: "custom-title", customTitle: name, sessionId: m.sid }) + "\n",
      "utf-8");
    fs.utimesSync(m.path, st.atimeMs / 1000, st.mtimeMs / 1000);   // utimes 无 ns 接口，ms 级恢复足够（排序比秒级 float）
    return true;
  } catch {
    return false;
  }
}

/** 剪贴板：pbcopy(macOS) → clip.exe(win)。返回 null=无工具。 */
export function copyBackend(): { argv: string[]; encoding: BufferEncoding } | null {  // encoding "utf-16le" 时消费端补 LE BOM（对齐 Python utf-16）
  const which = (c: string) => {
    const dirs = (process.env.PATH || "").split(path.delimiter);
    return dirs.some((d) => {
      try {
        return fs.statSync(path.join(d, c)).isFile();
      } catch {
        return false;
      }
    });
  };
  if (which("pbcopy")) return { argv: ["pbcopy"], encoding: "utf-8" };
  if (process.platform === "win32" && which("clip.exe")) {
    return { argv: ["clip.exe"], encoding: "utf-16le" };
  }
  return null;
}

/** 归一 ~（详情栏显示用）。 */
export function tilde(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

/**
 * ccs Node 原生版 M2：归档/还原/回收层逐语义移植（期望值以 Python 现行为准）。
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { encodedDirName } from "./parse.js";

/** Python paths()：env 缝隙 + 默认家目录。 */
export function paths(): [string, string] {
  const projects = process.env.CCS_PROJECTS_DIR || path.join(os.homedir(), ".claude", "projects");
  const home = process.env.CCS_HOME || path.join(os.homedir(), ".ccs");
  return [projects, home];
}

/** Python archive_dest：~/.ccs/archive/<encoded>/<file>。 */
export function archiveDest(m: { path: string }, ccsHome: string): string {
  const projects = paths()[0];
  return path.join(ccsHome, "archive", encodedDirName(m.path, projects),
    path.basename(m.path));
}

/** Python do_archive：mkdirs + shutil.move（跨设备回退 copy+unlink）。 */
export function doArchive(m: { path: string }, ccsHome: string): string {
  const dest = archiveDest(m, ccsHome);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(m.path, dest);
  } catch (e: any) {
    if (e.code === "EXDEV") {
      fs.copyFileSync(m.path, dest);
      fs.unlinkSync(m.path);
    } else {
      throw e;
    }
  }
  return dest;
}

/** Python do_restore：archive/<encoded>/<file> → projects/<encoded>/<file>。 */
export function doRestore(m: { path: string }, projectsDir: string): string {
  const encoded = path.basename(path.dirname(m.path));
  const dest = path.join(projectsDir, encoded, path.basename(m.path));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(m.path, dest);
  } catch (e: any) {
    if (e.code === "EXDEV") {
      fs.copyFileSync(m.path, dest);
      fs.unlinkSync(m.path);
    } else {
      throw e;
    }
  }
  return dest;
}

/** Python do_trash：~/.ccs/trash/<file>，重名加 .1/.2 后缀，不覆盖。 */
export function doTrash(m: { path: string }, ccsHome: string): string {
  const tdir = path.join(ccsHome, "trash");
  fs.mkdirSync(tdir, { recursive: true });
  let dest = path.join(tdir, path.basename(m.path));
  let i = 0;
  while (fs.existsSync(dest)) {
    i += 1;
    dest = path.join(tdir, `${path.basename(m.path)}.${i}`);
  }
  try {
    fs.renameSync(m.path, dest);
  } catch (e: any) {
    if (e.code === "EXDEV") {
      fs.copyFileSync(m.path, dest);
      fs.unlinkSync(m.path);
    } else {
      throw e;
    }
  }
  return dest;
}

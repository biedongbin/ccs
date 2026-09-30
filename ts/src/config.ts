/**
 * ccs Node 原生版 M4：配置层移植（config.json / resume_cmd 语义 / 自定义主题）。
 * 语义以 Python 现行为准（ccs: config_path/load_config/save_config/resume_cmd_full/_user_themes）。
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const DEFAULT_RESUME_CMD = "claude --resume {sid}";

export interface CcsConfig {
  lang?: string;
  theme?: string;
  resume_cmd?: string;
  custom?: Record<string, unknown>;
  [k: string]: unknown;
}

/** ~/.ccs 根目录（CCS_HOME env 缝隙，与 Python paths()[1] 一致）。 */
export function ccsHome(): string {
  return process.env.CCS_HOME || path.join(os.homedir(), ".ccs");
}

export function configPath(home = ""): string {
  return path.join(home || ccsHome(), "config.json");
}

export function loadConfig(home = ""): CcsConfig {
  try {
    const v = JSON.parse(fs.readFileSync(configPath(home), "utf-8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg: CcsConfig, home = ""): void {
  const h = home || ccsHome();
  fs.mkdirSync(h, { recursive: true });
  const tmp = path.join(h, "config.json.tmp");
  // Python: json.dump(..., ensure_ascii=False, indent=1)
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 1), "utf-8");
  fs.renameSync(tmp, configPath(h));
}

/** 用户只填基础命令（如 cc）：不含 {sid} 自动追加 --resume {sid}；含则原样兼容。 */
export function resumeCmdFull(cmd: string): string {
  return cmd.includes("{sid}") ? cmd : cmd.replace(/\s+$/, "") + " --resume {sid}";
}

export const COLOR_NAMES: Record<string, number> = {
  black: 0, red: 1, green: 2, yellow: 3,
  blue: 4, magenta: 5, cyan: 6, white: 7,
};

/** config.json "custom": {名字: [强调色, 消息色]} → {名字: [accent, msg]}。
 *  颜色取 8 色名或 0-255 整数；非法条目静默忽略（与 Python _user_themes 一致）。 */
export function userThemes(cfg: CcsConfig): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const custom = (cfg.custom ?? {}) as Record<string, unknown>;
  for (const [name, v] of Object.entries(custom)) {
    const pair: number[] = [];
    if (Array.isArray(v) && v.length === 2) {
      for (const c of v) {
        if (typeof c === "string" && c in COLOR_NAMES) pair.push(COLOR_NAMES[c]);
        // ponytail: Python isinstance(int) 另拒 "5.0"（json 得 float）；TS number 无 int/float 之分，
        // 仅手编 "5.0" 字面量这一不可达输入偏离，接受
        else if (typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 255) pair.push(c);
      }
    }
    if (pair.length === 2) out[name] = [pair[0], pair[1]];
  }
  return out;
}

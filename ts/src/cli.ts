/** ccs Node 版 CLI 入口：--config / -a / -r / --check / 首跑问答 / TUI。 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { loadConfig, saveConfig, configPath, DEFAULT_RESUME_CMD } from "./config.js";
import { setLang, T, relTime } from "./i18n.js";
import { scanAll } from "./scan.js";
import { paths } from "./store.js";

export function runCheck(): number {
  const metas = scanAll();
  const projects = new Set(metas.map((m) => m.cwd)).size;
  const arch = metas.filter((m) => m.archived).length;
  console.log(`会话 ${metas.length} · 项目 ${projects} · 归档 ${arch}`);   // Python run_check 同款硬编码
  for (const m of metas.slice(0, 5)) {
    const enc = path.basename(path.dirname(m.path)).slice(0, 24);
    console.log(`  ${relTime(m.mtime).padStart(6)} [${enc.padEnd(24)}] ${m.title.slice(0, 60)}`);
  }
  return 0;
}

/** 首跑顺序问答（Python run_config_plain 等价）。 */
export async function runConfigPlain(home = ""): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, (a) => r(a.trim())));
  console.log("== ccs 首次配置 / first-run setup ==");
  console.log("  1) 中文 (zh)  2) English (en)  3) 日本語 (ja)  4) 한국어 (ko)  5) Español (es)");
  console.log("  6) Français (fr)  7) Deutsch (de)  8) Русский (ru)  9) Português (pt)  10) Italiano (it)");
  const raw = await ask(`Language [1-10, Enter=zh]: `);
  const cfg = loadConfig(home);
  if (/^\d+$/.test(raw) && +raw >= 1 && +raw <= 10) {
    cfg.lang = ["zh", "en", "ja", "ko", "es", "fr", "de", "ru", "pt", "it"][+raw - 1];
  } else {
    cfg.lang = cfg.lang || "zh";
  }
  console.log("  1) default  2) ocean  3) dracula  4) mono");
  const raw2 = await ask("Theme [1-4, Enter=default]: ");
  if (["1", "2", "3", "4"].includes(raw2)) {
    cfg.theme = ["default", "ocean", "dracula", "mono"][+raw2 - 1];
  }
  const raw3 = await ask(`resume_cmd [${String(cfg.resume_cmd || DEFAULT_RESUME_CMD).replace(" --resume {sid}", "")}] (auto appends --resume {sid}): `);
  if (raw3) cfg.resume_cmd = raw3;
  saveConfig(cfg, home);
  rl.close();
  console.log(`saved -> ${configPath(home)}`);
}

function usage(): void {
  console.log("ccs - Claude Code sessions manager (Node build)\n"
    + "usage: ccs [-a] [-r] [--config] [--check]\n"
    + "  -a, --archive   start in archive view\n"
    + "  -r, --refresh   ignore cache, full rescan\n"
    + "  --config        open config panel\n"
    + "  --check         non-interactive summary");
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) { usage(); return 0; }
  if (argv.includes("--check")) return runCheck();
  const firstRun = !fs.existsSync(configPath());
  if (firstRun && !argv.includes("--config")) await runConfigPlain();

  const cfg = loadConfig();
  setLang(String(cfg.lang || "zh"));

  if (argv.includes("--config")) {
    const { render } = await import("ink");
    const React = await import("react");
    const { ConfigApp } = await import("./configui.js");
    await new Promise<void>((resolve) => {
      const inst = render(
        React.createElement(ConfigApp, {
          cfgIn: cfg,
          onDone: (saved: boolean) => {
            inst.unmount();
            console.log(saved ? `saved -> ${configPath()}` : "unchanged");
            resolve();
          },
        }),
        { exitOnCtrlC: false });
    });
    return 0;
  }

  // 主 TUI
  const { runTui } = await import("./app.js");
  await runTui(scanAll(argv.includes("-r") || argv.includes("--refresh")),
    argv.includes("-a") || argv.includes("--archive"),
    String(cfg.resume_cmd || DEFAULT_RESUME_CMD),
    String(cfg.theme || "default"), cfg.custom as Record<string, unknown> | undefined);
  return 0;
}

// ESM 入口判定：argv[1] 先 realpath（npm 全局 bin 是 symlink，不还原则不等 → main 静默不执行）
let _entry = process.argv[1] || "";
try { _entry = fs.realpathSync(_entry); } catch { /* keep raw */ }
if (_entry && import.meta.url === new URL("file://" + _entry).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}

/* M4/M5 单测：assert 式。resumeCmdFull 三态 / buildResumeArgv 分支 / config roundtrip /
   summaries.json 与 Python 互读 / startSummary+pollJobs（stub claude）/ 孤儿 harvest。 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const HOME = "/tmp/ccs_unit_home";
process.env.CCS_HOME = HOME;
fs.rmSync(HOME, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });

const { resumeCmdFull, userThemes, loadConfig, saveConfig, DEFAULT_RESUME_CMD } =
  require("../dist/config");
const { buildResumeArgv, splitLikeShlex, execResumeAt } = require("../dist/resume");
const { buildSummaryArgv, startSummary, pollJobs, loadSummaries, harvestSummaries } =
  require("../dist/summary");

let n = 0;
function ok(name, cond) {
  assert(cond, name);
  n++;
  console.log("PASS " + name);
}

// ---- config ----
ok("resumeCmdFull 基础命令追加", resumeCmdFull("cc") === "cc --resume {sid}");
ok("resumeCmdFull 含 sid 原样", resumeCmdFull("cc --resume {sid}") === "cc --resume {sid}");
ok("resumeCmdFull 默认命令", resumeCmdFull(DEFAULT_RESUME_CMD) === DEFAULT_RESUME_CMD);
ok("resumeCmdFull 尾空格归一", resumeCmdFull("cc  ") === "cc --resume {sid}");

saveConfig({ lang: "ja", theme: "ocean", resume_cmd: "cc" });
const cfg = loadConfig();
ok("config roundtrip", cfg.lang === "ja" && cfg.theme === "ocean" && cfg.resume_cmd === "cc");
ok("config json 可被 python json 读", spawnSync("python3", ["-c",
  "import json;v=json.load(open('" + HOME + "/config.json'));assert v['lang']=='ja'"]).status === 0);
ok("userThemes 色名", JSON.stringify(userThemes({ custom: { nord: ["cyan", 114] } })) ===
  JSON.stringify({ nord: [6, 114] }));
ok("userThemes 非法忽略", JSON.stringify(userThemes({ custom: { bad: ["nope", "x"], ok: [7, 200] } })) ===
  JSON.stringify({ ok: [7, 200] }));

// ---- resume ----
process.env.SHELL = "/bin/zsh";
ok("argv 交交互 shell", JSON.stringify(buildResumeArgv("cc --resume {sid}", "s9")) ===
  JSON.stringify(["/bin/zsh", "-ic", "cc --resume s9"]));
ok("argv 基础命令自动补", JSON.stringify(buildResumeArgv("cc", "s9")) ===
  JSON.stringify(["/bin/zsh", "-ic", "cc --resume s9"]));
process.env.SHELL = "";
delete process.env.SHELL;
ok("argv SHELL 缺省 /bin/sh", JSON.stringify(buildResumeArgv("claude --resume {sid}", "s1")) ===
  JSON.stringify(["/bin/sh", "-ic", "claude --resume s1"]));
ok("shlex 拆分", JSON.stringify(splitLikeShlex('claude -p "a b"  --x')) ===
  JSON.stringify(["claude", "-p", "a b", "--x"]));
// win32 分支：子进程 ESM 桩（dist 为 ESM，new Function 不可用）
const resSrc = fs.readFileSync(path.join(ROOT, "dist", "resume.js"), "utf-8");
const stubCode = 'Object.defineProperty(process,"platform",{value:"win32"});\n'
  + resSrc.replace(/from "(\.\/[^"]+)"/g, (_m, p) => `from "${path.join(ROOT, "dist", p)}"`)
  + '\nconsole.log(JSON.stringify(buildResumeArgv("cc --resume {sid}", "s2")));';
const stubR = spawnSync(process.execPath, ["--input-type=module", "-e", stubCode], { encoding: "utf8" });
ok("win32 直拆直执行", stubR.status === 0
  && JSON.stringify(JSON.parse(stubR.stdout.trim())) === JSON.stringify(["cc", "--resume", "s2"]));

// execResumeAt：真执行 echo，验证 chdir + 退出码透传
const proj = path.join(os.tmpdir(), "ccs_unit_proj");
fs.rmSync(proj, { recursive: true, force: true });
fs.mkdirSync(proj, { recursive: true });
const meta = { sid: "s-exec", cwd: proj, title: "t" };
const r = execResumeAt(meta, "true", proj);   // true 忽略 --resume 参数
ok("execResumeAt 状态透传", r.needDir === false && r.status === 0);

// ---- summary ----
const meta2 = { sid: "sid-sum", cwd: proj, title: "总结目标", path: proj + "/x.jsonl" };
const argvS = buildSummaryArgv(meta2);
ok("summary argv 形状", argvS[0] === "claude" && argvS[1] === "-p" &&
  argvS.includes("--allowedTools") && argvS.includes("Read"));
ok("prompt 逐字含 sessionId", argvS[2].includes("sessionId=sid-sum"));

// 假 claude：PATH 前置 stub 脚本
const stubDir = path.join(os.tmpdir(), "ccs_stub_bin");
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(path.join(stubDir, "claude"),
  "#!/bin/sh\necho '## 总结输出\n- 目标 A\n- 进度 100%'\n");
fs.chmodSync(path.join(stubDir, "claude"), 0o755);
const envWithStub = { ...process.env, PATH: stubDir + ":" + process.env.PATH };
const origPath = process.env.PATH;
process.env.PATH = envWithStub.PATH;
ok("startSummary 登记任务", startSummary(meta2) === true);
process.env.PATH = origPath;

(async () => {
  // 真异步等待：阻塞式睡眠会冻结事件循环，子进程 exit 事件永不派发
  let events = [];
  for (let i = 0; i < 50 && events.length === 0; i++) {
    events = pollJobs();
    if (events.length === 0) await new Promise((r) => setTimeout(r, 100));
  }
  ok("pollJobs 收割成功事件", events.length === 1 && events[0].ok === true &&
    events[0].sid === "sid-sum");
  const sums = loadSummaries();
  ok("summaries.json 落盘", sums["sid-sum"] && sums["sid-sum"].text.includes("进度 100%"));

  // Python 侧互读验证
  const py = spawnSync("python3", ["-c",
    "import json;v=json.load(open('" + HOME + "/summaries.json'));" +
    "assert isinstance(v['sid-sum']['text'], str) and v['sid-sum']['ts'] > 0"]);
  ok("python 可读 summaries.json", py.status === 0);

  // 孤儿 harvest：造旧 .out + 新 .out 各一
  const sd = path.join(HOME, "summarize");
  fs.mkdirSync(sd, { recursive: true });
  const oldOut = path.join(sd, "sid-old.out");
  fs.writeFileSync(oldOut, "孤儿输出内容");
  const t = (Date.now() - 200 * 1000) / 1000;
  fs.utimesSync(oldOut, t, t);
  fs.writeFileSync(path.join(sd, "sid-new.out"), "太新不收");
  harvestSummaries(120);
  const sums2 = loadSummaries();
  ok("harvest 收旧跳新", sums2["sid-old"] && sums2["sid-old"].text === "孤儿输出内容" && !sums2["sid-new"]);
  ok("harvest 删 .out", !fs.existsSync(oldOut));

  // D1/D2 审计回归：shQuote 对齐 shlex.quote；语义 argv 收紧 --allowedTools
  const { shQuote } = require("../dist/resume");
  ok("shQuote 安全字符原样", shQuote("deadbeef-1234") === "deadbeef-1234");
  ok("shQuote 引注怪 sid", shQuote("a'; b") === "'a'\"'\"'; b'");
  ok("shQuote 空串", shQuote("") === "''");
  ok("resume argv 引注怪 sid", buildResumeArgv("claude --resume {sid}", "a'; b")[2]
    === "claude --resume 'a'\"'\"'; b'");
  const { buildSemanticArgv } = require("../dist/summary");
  const meta = require("../dist/parse");
  const mm = { sid: "s1", title: "t", cwd: "/w", branch: "", mtime: 0, size: 0, path: "/p",
    first_user: "", last_reply: "", first_cmds: [], last_cmds: [], all_cmds: [],
    summary: "", archived: false, entrypoint: "", custom_title: "", ai_title: "" };
  ok("semantic argv 收紧 allowedTools",
    JSON.stringify(buildSemanticArgv([mm], "x 修复").slice(-2)) === JSON.stringify(["--allowedTools", "Read"]));

  console.log(`${n}/${n} M4+M5 unit tests passed`);
  process.exit(n >= 26 ? 0 : 1);
})();

/* B3 审计回归：Node 缓存层读写/命中/修剪（键格式与 Python cache.json 互通）。 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-cache-"));
const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-cache-proj-"));
process.env.CCS_HOME = home;
process.env.CCS_PROJECTS_DIR = projRoot;

const { scanAll } = require("../dist/scan");
const { CcsCache, CACHE_VERSION } = require("../dist/cache");

let n = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  n++;
  console.log(`PASS ${name}`);
};

// 布景：projects/<enc>/a.jsonl
const enc = path.join(projRoot, "-w-cache");
fs.mkdirSync(enc, { recursive: true });
const f1 = path.join(enc, "a.jsonl");
fs.writeFileSync(f1, JSON.stringify({ type: "user", sessionId: "s-cache", cwd: enc,
  gitBranch: "m", message: { role: "user", content: "缓存回路验证" } }) + "\n");

const r1 = scanAll();
ok("scanAll 建缓存文件", fs.existsSync(path.join(home, "cache.json")));
const raw = JSON.parse(fs.readFileSync(path.join(home, "cache.json"), "utf-8"));
ok("缓存键 v20 前缀", Object.keys(raw).some((k) => k.startsWith(`v${CACHE_VERSION}|`)));
ok("scanAll 结果含会话", r1.some((m) => m.sid === "s-cache"));
const r2 = scanAll();
ok("二次扫描命中一致", r2.some((m) => m.sid === "s-cache" && m.first_user === "缓存回路验证"));
ok("二次扫描行数一致", r1.length === r2.length);

// 修剪：幽灵键（文件不存在）不落盘
const c = new CcsCache(path.join(home, "cache.json"));
const ghost = { path: path.join(enc, "ghost.jsonl"), sid: "g", title: "", cwd: "", branch: "",
  first_user: "", last_reply: "", first_cmds: [], last_cmds: [], all_cmds: [],
  summary: "", archived: false, entrypoint: "", custom_title: "", ai_title: "" };
c.put(ghost, 999);
c.save();
const raw2 = JSON.parse(fs.readFileSync(path.join(home, "cache.json"), "utf-8"));
ok("修剪裁掉幽灵键", !Object.keys(raw2).some((k) => k.includes("ghost.jsonl")));
ok("修剪保留活键", Object.keys(raw2).some((k) => k.includes("a.jsonl")));

// 键格式 = Python 键格式（v20|绝对路径|ns 十进制）——同盘互读的前提
const realKey = Object.keys(raw).find((k) => k.includes("a.jsonl")) || "";
ok("键格式 v20|path|ns", /^v20\|.+\|\d+$/.test(realKey));
const c3 = new CcsCache(path.join(home, "cache.json"));
ok("重读命中既有键", c3.get(realKey) !== null);

console.log(`${n} cache tests passed`);

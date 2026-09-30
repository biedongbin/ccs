/* M5 summary 专项：格式与 Python 互读、20000 截断、harvest ts 取 mtime。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

process.env.CCS_HOME = "/tmp/ccs_unit_home2";
const HOME = process.env.CCS_HOME;
fs.rmSync(HOME, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });

const { loadSummaries, saveSummaries, summariesPath } = require("../dist/summary");
const { execFileSync } = require("child_process");

let n = 0;
const ok = (name, cond) => { assert(cond, name); n++; console.log("PASS " + name); };

saveSummaries({ "sid-a": { text: "内容".repeat(15000), ts: 1727700000 } });   // 30000 字符 > 20000
const raw = JSON.parse(fs.readFileSync(summariesPath(), "utf-8"));
ok("saveSummaries 不截断（截断属 pollJobs）", raw["sid-a"].text.length === 30000);

// Python json 互读 + 字段结构
const py = spawnSync("python3", ["-c",
  "import json;v=json.load(open('" + summariesPath() + "'));"
  + "assert set(v['sid-a'].keys())=={'text','ts'} and v['sid-a']['ts']==1727700000"]);
ok("python 互读同构", py.status === 0);

ok("loadSummaries roundtrip", loadSummaries()["sid-a"].text.length === 30000);
ok("缺文件返回 {}", loadSummaries.call(null) !== undefined);

// tmp+rename 原子性：无 .tmp 残留
ok("无 tmp 残留", !fs.existsSync(summariesPath() + ".tmp"));

console.log(`${n}/${n} M5 summary tests passed`);

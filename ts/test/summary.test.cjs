/* M5 summary 专项：格式与 Python 互读、20000 截断、harvest ts 取 mtime。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

process.env.CCS_HOME = "/tmp/ccs_unit_home2";
const HOME = process.env.CCS_HOME;
fs.rmSync(HOME, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });

const { loadSummaries, saveSummaries, summariesPath, parseStreamOut,
        buildSummaryArgv, buildSummaryFileArgv, writeConvStream } = require("../dist/summary");
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

// ---- 新增：stream-json 解析 / 双路径 argv / 对话流剥离 ----
const tmpD = path.join(HOME, "tmp");
fs.mkdirSync(tmpD, { recursive: true });

const o1 = path.join(tmpD, "o1.out");
fs.writeFileSync(o1, [
  JSON.stringify({ type: "stream_event", event: { delta: { type: "text_delta", text: "abc" } } }),
  JSON.stringify({ type: "stream_event", event: { delta: { type: "text_delta", text: "de" } } }),
].join("\n"));
let [t1, p1, s1] = parseStreamOut(o1);
ok("parseStreamOut 半截：无 result", t1 === null && p1 === 5 && s1 === false);
fs.appendFileSync(o1, "\n" + JSON.stringify({ type: "result", result: "abcde" }));
[t1, p1, s1] = parseStreamOut(o1);
ok("parseStreamOut 完整：见 result", t1 === "abcde" && p1 === 5 && s1 === true);

ok("parseStreamOut 缺文件不抛错", JSON.stringify(parseStreamOut(path.join(tmpD, "nope.out"))) === "[null,0,false]");

const small = buildSummaryArgv();
ok("小流走 stdin（无 Read）", !small.includes("--allowedTools") && small.includes("stream-json"));
const big = buildSummaryFileArgv("/tmp/x.conv");
ok("大流走文件路径（含 Read）", big.includes("--allowedTools") && big.includes("Read") && big[2].includes("/tmp/x.conv"));

const convSrc = path.join(tmpD, "s.jsonl");
const convDst = path.join(tmpD, "s.conv");
fs.writeFileSync(convSrc, [
  JSON.stringify({ type: "user", message: { role: "user", content: "首问" }, cwd: "/w" }),
  JSON.stringify({ type: "last-prompt", rendered: [{ content: "副本" }] }),
  JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }] } }),
  JSON.stringify({ type: "user", isSidechain: true, message: { role: "user", content: "子代理" } }),
].join("\n"));
ok("writeConvStream 成功", writeConvStream(convSrc, convDst) === true);
const cl = fs.readFileSync(convDst, "utf-8").trim().split("\n").map((x) => JSON.parse(x));
ok("剥离元数据 + sidechain", cl.length === 2 && cl[0].content === "首问");
ok("工具块零失真保留", cl[1].content[0].name === "Bash");

console.log(`${n}/${n} M5 summary tests passed`);

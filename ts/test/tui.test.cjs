/* M3 TUI 逻辑单测（渲染断言走 pty_e2e.py 真终端——ink 测试库系 ESM 不可 require）。 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-tui-"));
const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-proj-"));
process.env.CCS_HOME = home;
process.env.CCS_PROJECTS_DIR = projRoot;

function writeJsonl(p, objs) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, objs.map((o) => JSON.stringify(o)).join("\n") + "\n");
}
const enc = path.join(projRoot, "-tmp-alpha");
const A = path.join(enc, "a.jsonl");
writeJsonl(A, [
  { type: "user", sessionId: "sid-a", cwd: "/tmp/alpha", gitBranch: "master",
    message: { role: "user", content: "修复登录问题" } },
  { type: "assistant", sessionId: "sid-a", cwd: "/tmp/alpha",
    message: { role: "assistant", content: [{ type: "text", text: "已修复完毕" }] } },
]);
writeJsonl(path.join(enc, "b.jsonl"), [
  { type: "user", sessionId: "sid-b", cwd: "/tmp/alpha", gitBranch: "dev",
    message: { role: "user", content: "搜索功能优化" } },
]);

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log("PASS " + name); };

// 1. scanAll：两条、mtime 降序
const { scanAll, doRename } = require("../dist/scan");
let metas = scanAll();
ok("scanAll 2 sessions", metas.length === 2);
ok("sorted desc", metas[0].mtime >= metas[1].mtime);

// 2. doRename：内容生效 + mtime 恢复（B1 关联——防列表跳顶）
const mt0 = fs.statSync(A).mtimeMs;
const target = metas.find((m) => m.sid === "sid-a");
ok("doRename true", doRename(target, "新名字") === true);
ok("mtime preserved after rename (ms tol)", Math.abs(fs.statSync(A).mtimeMs - mt0) < 5);
metas = scanAll();
ok("custom title wins", metas.find((m) => m.sid === "sid-a").title === "新名字");
{
  const idx = metas.findIndex((m) => m.sid === "sid-a");
  const minM = Math.min(...metas.map((m) => m.mtime));
  const mine = metas[idx].mtime;
  ok("no jump-to-top: renamed stays oldest", idx === metas.length - 1 && Math.abs(mine - minM) < 1e-6);
}

// 3. 帮助行段折行（同键说明不拆行）
const { hardWrap } = require("../dist/width");
const ls = hardWrap(" jk 选择 | / 搜索 | Enter 恢复 | q 退出", 20);
ok("help wraps by segment", ls.length >= 2);
ok("segment stays whole", ls.some((l) => l.includes("q 退出")) && ls.some((l) => l.includes("Enter 恢复")));
ok("no orphan tiny segment line", ls.every((l) => l.replace(/\s/g, "").length >= 2));

// 4. i18n：10 语言 + 回退链
const { T, setLang } = require("../dist/i18n");
setLang("ja");
ok("ja help loaded", T("help").includes("↑↓") || T("help").includes("検索"));
ok("ja 新六键在表", T("search_c") === "内容: " && T("sem_p") === "意味: " && T("badge_sem").includes("意味"));
setLang("zh");
ok("zh 内容/语义键", T("search_c") === "内容: " && T("sem_p") === "语义: " && T("sem_done").includes("{n}"));
setLang("xx");
ok("unknown lang falls back", T("help").length > 0);
setLang("zh");
ok("zh title format", T("title", { n: 2 }).includes("2"));

// 5. 主题：custom 主题进 palette
const { resumeCmdFull, userThemes } = require("../dist/config");
ok("resumeCmdFull base appends", resumeCmdFull("cc") === "cc --resume {sid}");
ok("resumeCmdFull full keeps", resumeCmdFull("cc --resume {sid}") === "cc --resume {sid}");
const th = userThemes({ custom: { nord: ["cyan", 114], bad: ["nope"] } });
ok("userThemes valid kept (name→curses code)", th.nord && th.nord[0] === 6 && th.nord[1] === 114);
ok("userThemes invalid dropped", !("bad" in th));

// 6. 归档往返 + archived 判定（store 对拍已覆盖，此处链路级）
const { doArchive, paths } = require("../dist/store");
metas = scanAll();
const arch0 = metas.find((m) => m.sid === "sid-b");
doArchive(arch0, home);
metas = scanAll();
ok("archived flagged", metas.find((m) => m.sid === "sid-b").archived === true);
ok("archive path layout", fs.existsSync(path.join(home, "archive", "-tmp-alpha", "b.jsonl")));

// 7. picker items 聚合语义（复刻 app 内逻辑纯函数化验证）
const agg = new Map();
for (const m of metas) {
  if (m.archived) continue;
  agg.set(m.cwd, Math.max(agg.get(m.cwd) || 0, m.mtime));
}
ok("project agg one cwd", agg.size === 1 && agg.has("/tmp/alpha"));

// 8. mdLines 用于详情（AI 总结 markdown）
const { mdLines } = require("../dist/width");
const md = mdLines("## 标题\n\n| a | bb |\n|---|---|\n| 1 | 2 |**bold**", 40);
ok("md heading mapped", md.some((l) => l.includes("▪")));
ok("md table aligned", md.some((l) => l.includes("a ") && l.includes("bb")));

// 9. summaries 互读字段（Python 结构 sid→{text,ts}）
const { loadSummaries, saveSummaries } = require("../dist/summary");
saveSummaries({ "sid-a": { text: "x".repeat(30), ts: 12345 } });
const s2 = loadSummaries();
ok("summary roundtrip", s2["sid-a"].text.length === 30 && s2["sid-a"].ts === 12345);

// 10. first_cmds/last_cmds：前3 + 后3、≤6 去重（v16）
{
  const C = path.join(enc, "c.jsonl");
  const cmds = [];
  for (let i = 1; i <= 8; i++) {
    cmds.push({ type: "user", sessionId: "sid-c", cwd: "/tmp/alpha",
      message: { role: "user", content: `指令${i}号` } });
    cmds.push({ type: "assistant", sessionId: "sid-c", cwd: "/tmp/alpha",
      message: { role: "assistant", content: [{ type: "text", text: `答${i}` }] } });
  }
  writeJsonl(C, cmds);
  const { parseJsonl } = require("../dist/parse");
  const r = parseJsonl(C);
  const m = r.kind === "meta" ? r.meta : null;
  ok("first_cmds 前3", !!m && m.first_cmds.join(",") === "指令1号,指令2号,指令3号");
  ok("last_cmds 后3", !!m && m.last_cmds.join(",") === "指令6号,指令7号,指令8号");
  writeJsonl(C, [
    { type: "user", sessionId: "sid-c", cwd: "/tmp/alpha",
      message: { role: "user", content: "A" } },
    { type: "user", sessionId: "sid-c", cwd: "/tmp/alpha",
      message: { role: "user", content: "B" } },
  ]);
  const r2 = parseJsonl(C);
  const m2 = r2.kind === "meta" ? r2.meta : null;
  // v17 分段收集：first 只收 head 段、last 只收 tail 段——小文件重叠不再重复（[A,B] 而非 [A,B,A]）
  ok("双采样分段收集（重叠去重）", !!m2 && m2.first_cmds.join() === "A,B" && m2.last_cmds.join() === "A,B");
}

// ---- 9. 内容搜索 / 语义集 / 候选窗口 ----
{
  // 过滤逻辑复刻 app.tsx rows 语义做纯函数断言
  const mk = (sid, title, cmds, reply, mtime) => ({
    sid, title, cwd: "/w/" + sid, branch: "", mtime, size: 1, path: "",
    first_user: "", last_reply: reply, summary: "", archived: false,
    entrypoint: "", custom_title: "", ai_title: "",
    first_cmds: cmds, last_cmds: [],
  });
  const filter = (ss, q, content, semantic) => ss.filter((m) => {
    if (semantic !== null && !semantic.has(m.sid)) return false;
    if (!q) return true;
    if (content) return ([...m.first_cmds, ...m.last_cmds].join(" ") + " " + m.last_reply).toLowerCase().includes(q.toLowerCase());
    return (m.title + m.cwd + m.sid).toLowerCase().includes(q.toLowerCase());
  });
  const s1 = mk("s1", "标题A", ["部署流程文档"], "回滚方案", 100);
  const s2 = mk("s2", "标题B", ["别的"], "无关", 200);
  const ss = [s2, s1];
  ok("内容搜索命中 last_reply", filter(ss, "回滚", true, null).map((m) => m.sid).join() === "s1");
  ok("内容搜索命中 first_cmds", filter(ss, "部署", true, null).map((m) => m.sid).join() === "s1");
  ok("三域搜索不搜内容", filter(ss, "回滚", false, null).length === 0);
  ok("语义集过滤", filter(ss, "", false, new Set(["s2"])).map((m) => m.sid).join() === "s2");
  const { semanticCandidates, buildSemanticArgv } = require("../dist/summary");
  const now = Date.now() / 1000;
  const fresh = mk("f", "t", [], "", now - 86400);
  const stale = mk("o", "t", [], "", now - 20 * 86400);
  ok("候选默认 15 天窗", semanticCandidates([fresh, stale], "找点东西").map((m) => m.sid).join() === "f");
  ok("查询含时间范围放开", semanticCandidates([fresh, stale], "找 30天 前的").length === 2);
  const argv = buildSemanticArgv([fresh, stale], "部署相关");   // 候选<全集 → 才标注 15 天窗口（Python 同语义）
  ok("语义 prompt 含清单/查询/窗口", argv[0] === "claude" && argv[1] === "-p" && argv[2].includes("部署相关")
     && argv[2].includes('"sid":"f"') && !argv[2].includes('"sid":"o"') && argv[2].includes("最近 15 天"));
  const argv2 = buildSemanticArgv([fresh], "部署相关");           // 全集都在窗内 → 无窗口标注
  ok("无窗口标注场景", argv2[2].includes('"sid":"f"') && !argv2[2].includes("最近 15 天"));
}

console.log(`${pass} M3 logic tests passed`);

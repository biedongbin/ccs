/* 壳自检：npm pack 内容齐全 + spawn python 跑 --check 通。断言式，无框架。 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");

// 1. prepublish 复制后包内三件齐全
execFileSync("node", ["-e",
  "require('fs').copyFileSync('../ccs','ccs');require('fs').copyFileSync('../README.md','README.md')"],
  { cwd: root });
for (const f of ["ccs", "README.md", "bin/ccs.js"]) {
  assert(fs.existsSync(path.join(root, f)), f + " missing");
}

// 2. spawn 跑 --check（隔离 CCS_HOME/PROJECTS）
const env = { ...process.env, CCS_HOME: "/tmp/ccs_npm_home", CCS_PROJECTS_DIR: "/tmp/ccs_npm_proj" };
fs.mkdirSync("/tmp/ccs_npm_home", { recursive: true });
fs.mkdirSync("/tmp/ccs_npm_proj/-fake-proj", { recursive: true });
const r = spawnSync(process.execPath, [path.join(root, "bin", "ccs.js"), "--check"], { env, encoding: "utf8" });
assert.strictEqual(r.status, 0, "--check exit " + r.status + ": " + r.stderr);
assert(/会话|sessions|ccs/i.test(r.stdout), "unexpected output: " + r.stdout);

// 3. 无 python 时明确报错（PATH 清空模拟）
const r2 = spawnSync(process.execPath, [path.join(root, "bin", "ccs.js"), "--check"], {
  env: { ...process.env, PATH: "/nonexistent" }, encoding: "utf8",
});
assert.strictEqual(r2.status, 1);
assert(/python3/i.test(r2.stderr), "should hint python3");


// 4. C1 回归：npm 全局 bin 是 symlink——入口判定必须经 realpath（否则静默哑火）
{
  const os = require("os");
  const link = path.join(os.tmpdir(), "ccs_c1_reg");
  try { fs.unlinkSync(link); } catch {}
  fs.symlinkSync(path.join(root, "dist", "cli.js"), link);
  const r4 = spawnSync(process.execPath, [link, "--check"], {
    env: { ...process.env, CCS_HOME: "/tmp/ccs_c1_reg", CCS_PROJECTS_DIR: path.join(root, "fixtures", "projects") },
    encoding: "utf8",
  });
  assert.strictEqual(r4.status, 0, "symlink bin exit " + r4.status + ": " + r4.stderr);
  assert(/会话|sessions/.test(r4.stdout), "symlink bin silent (C1 regression): " + r4.stdout);
}

console.log("4/4 npm-shape tests passed");
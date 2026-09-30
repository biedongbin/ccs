#!/usr/bin/env node
/* ccs npm 壳：定位 python3（Windows 回退 python），spawn 捆绑的 ccs。 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SCRIPT = path.join(__dirname, "..", "ccs");

function pythonCmd() {
  const cands = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  for (const c of cands) {
    const r = spawnSync(c, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return c;
  }
  console.error("ccs 需要 python3（未找到）。请安装 Python 3.9+ 后重试 / python3 is required.");
  process.exit(1);
}

const r = spawnSync(pythonCmd(), [SCRIPT, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);

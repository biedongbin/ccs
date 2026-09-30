#!/usr/bin/env node
/* M1 对拍：Node 移植层输出 vs Python 基准（tools/dump_py.py 生成），数字容差 1e-6。 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseJsonl, launchDir, scanProjects } = require("../dist/parse.js");

const ROOT = path.join(__dirname, "..", "..");
const FIX = path.join(ROOT, "ts", "fixtures");
const PROJ = path.join(FIX, "projects", "-w-projA");
const ARCH = path.join(FIX, "archive", "-w-projA");
const BASE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "parity_py.json"), "utf8"));

const LD_ROOT = "/tmp/ccs_parity_ld";
fs.mkdirSync(path.join(LD_ROOT, "my-project-x", "src"), { recursive: true });

function deepEq(a, b, p, errs) {
  if (typeof a === "number" && typeof b === "number") {
    if (Object.is(a, b) || Math.abs(a - b) < 1e-6) return true;
    errs.push(`${p}: ${a} != ${b}`);
    return false;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a !== b) errs.push(`${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return a === b;
  }
  const ka = Object.keys(a).sort();
  const byKey = (o) => Object.keys(o).sort();
  if (JSON.stringify(ka) !== JSON.stringify(byKey(b))) {
    errs.push(`${p}: keys ${ka} != ${byKey(b)}`);
    return false;
  }
  for (const k of ka) deepEq(a[k], b[k], `${p}.${k}`, errs);
  return true;
}

// ---- parse 对拍 ----
let n = 0;
for (const sub of [PROJ, ARCH]) {
  for (const fn of fs.readdirSync(sub).sort()) {
    if (!fn.endsWith(".jsonl")) continue;
    const r = parseJsonl(path.join(sub, fn));
    let got;
    if (r.kind === "meta") {
      got = { kind: "meta", ...r.meta };
    } else {
      got = { ...r };
    }
    const want = BASE.parse[fn];
    assert.ok(want, `no baseline for ${fn}`);
    const errs = [];
    deepEq(got, want, fn, errs);
    assert.deepStrictEqual(errs, [], `parse ${fn}`);
    n++;
  }
}

// ---- launch_dir 对拍 ----
const cases = JSON.parse(
  fs.readFileSync(path.join(FIX, "launchdir_cases.json"), "utf8"));
for (const [name, c] of Object.entries(cases)) {
  const got = launchDir(c.encoded, c.hint);
  const want = BASE.launch_dir[name];
  assert.strictEqual(got, want, `launch_dir ${name}: ${got} != ${want}`);
  n++;
}

// ---- scanProjects 对拍 ----
{
  const got = scanProjects(PROJ, ARCH).map(m => ({ kind: "meta", ...m }));
  const want = BASE.scan.map(m => ({ kind: "meta", ...m }));
  assert.strictEqual(got.length, want.length,
    `scan count ${got.length} != ${want.length}`);
  for (let i = 0; i < got.length; i++) {
    const errs = [];
    deepEq(got[i], want[i], `scan[${i}]`, errs);
    assert.deepStrictEqual(errs, [], `scan[${i}]`);
  }
  n++;
}

console.log(`parity ${n} groups ALL PASS ` +
  `(parse=${Object.keys(BASE.parse).length}, ld=${Object.keys(BASE.launch_dir).length}, scan=${BASE.scan.length})`);

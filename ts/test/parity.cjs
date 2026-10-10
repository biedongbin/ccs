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

const SKIP_KEYS = new Set(["mtime"]);   // mtime 随 git checkout/重生成而变，不具对拍意义（排序语义已由 scan 列表序覆盖）

function deepEq(a, b, p, errs) {
  if (typeof a === "number" && typeof b === "number") {
    if (Object.is(a, b) || Math.abs(a - b) < 1e-6) return true;
    errs.push(`${p}: ${a} != ${b}`);
    return false;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    // repo 根前缀归一化：绝对路径随检出位置变化，比对前剥成相对路径（迁移/换机器均稳定）
    const strip = (s) => typeof s === "string" ? s.split(ROOT + path.sep).join("") : s;
    const [na, nb] = [strip(a), strip(b)];
    if (na !== nb) errs.push(`${p}: ${JSON.stringify(na)} != ${JSON.stringify(nb)}`);
    return na === nb;
  }
  const ka = Object.keys(a).sort();
  const byKey = (o) => Object.keys(o).sort();
  if (JSON.stringify(ka) !== JSON.stringify(byKey(b))) {
    errs.push(`${p}: keys ${ka} != ${byKey(b)}`);
    return false;
  }
  for (const k of ka) {
    if (SKIP_KEYS.has(k)) continue;
    deepEq(a[k], b[k], `${p}.${k}`, errs);
  }
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

// ---- width 对拍 ----
const W = require("../dist/width.js");
{
  let wn = 0;
  for (const [k, v] of Object.entries(BASE.width.dw)) {
    assert.strictEqual(W.dw(eval(`(${k})`)), v, `dw ${k}`);
    wn++;
  }
  for (const [k, v] of Object.entries(BASE.width.cut)) {
    assert.strictEqual(W.cut(v.args[0], v.args[1]), v.ret, `cut #${k}`);
    wn++;
  }
  for (const [k, v] of Object.entries(BASE.width.pad)) {
    assert.strictEqual(W.pad(v.args[0], v.args[1]), v.ret, `pad #${k}`);
    wn++;
  }
  for (const [k, v] of Object.entries(BASE.width.hard_wrap)) {
    assert.deepStrictEqual(W.hardWrap(v.args[0], v.args[1]), v.ret, `hard_wrap #${k}`);
    wn++;
  }
  for (const [k, v] of Object.entries(BASE.width.md_lines)) {
    assert.deepStrictEqual(W.mdLines(v.args[0], v.args[1]), v.ret, `md_lines #${k}`);
    wn++;
  }
  for (const [k, v] of Object.entries(BASE.width.fold_wide)) {
    assert.deepStrictEqual(W.foldWide(v.args[0], v.args[1]), v.ret, `fold_wide #${k}`);
    wn++;
  }
  n += wn;
}

// ---- store 对拍：fresh 树同构重放（rename 与 Python shutil.move 同语义）----
{
  const S = require("../dist/store.js");
  const fse = require("fs");
  const SROOT = "/tmp/ccs_parity_store";
  fse.rmSync(SROOT, { recursive: true, force: true });
  const proj = path.join(SROOT, "projects", "-w-projA");
  const home = path.join(SROOT, "ccs");
  fse.mkdirSync(proj, { recursive: true });
  const w = (fn) => {
    const p = path.join(proj, fn);
    fse.writeFileSync(p, '{"sessionId": "sid-x"}\n');
    return p;
  };
  const tree = (root) => {
    const out = [];
    const walk = (d) => {
      for (const e of fse.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(path.relative(root, p));
      }
    };
    walk(root);
    return out.sort();
  };
  let sn = 0;
  const m1 = w("a.jsonl");
  const ad = S.doArchive({ path: m1 }, home);
  assert.strictEqual(ad, BASE.store.archive.dest, "archive dest");
  assert.deepStrictEqual(tree(SROOT), BASE.store.archive.tree, "archive tree");
  sn++;
  const rd = S.doRestore({ path: BASE.store.archive.dest }, proj);
  assert.strictEqual(rd, BASE.store.restore.dest, "restore dest");
  assert.deepStrictEqual(tree(SROOT), BASE.store.restore.tree, "restore tree");
  sn++;
  assert.strictEqual(S.archiveDest({ path: m1 }, home), BASE.store.archive_dest,
    "archive_dest");
  sn++;
  const tdests = [];
  for (let i = 0; i < 3; i++) {
    tdests.push(S.doTrash({ path: w("t.jsonl") }, home));
  }
  assert.deepStrictEqual(tdests, BASE.store.trash3.dests, "trash3 dests");
  assert.deepStrictEqual(tree(SROOT), BASE.store.trash3.tree, "trash3 tree");
  sn++;
  const oldP = process.env.CCS_PROJECTS_DIR;
  const oldH = process.env.CCS_HOME;
  delete process.env.CCS_PROJECTS_DIR;
  delete process.env.CCS_HOME;
  assert.deepStrictEqual(S.paths(), BASE.store.paths_default, "paths default");
  process.env.CCS_PROJECTS_DIR = "/p";
  process.env.CCS_HOME = "/h";
  assert.deepStrictEqual(S.paths(), BASE.store.paths_env, "paths env");
  if (oldP === undefined) delete process.env.CCS_PROJECTS_DIR; else process.env.CCS_PROJECTS_DIR = oldP;
  if (oldH === undefined) delete process.env.CCS_HOME; else process.env.CCS_HOME = oldH;
  sn++;
  n += sn;
}

console.log(`parity ${n} groups ALL PASS ` +
  `(parse=${Object.keys(BASE.parse).length}, ld=${Object.keys(BASE.launch_dir).length}, scan=${BASE.scan.length}, ` +
  `width, store)`);

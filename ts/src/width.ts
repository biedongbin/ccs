/**
 * ccs Node 原生版 M1.5：宽度/渲染层逐语义移植（期望值以 Python 现行为准）。
 * _dw 的宽度表来自 tools/gen_eaw.py 生成的 eaw.json（与本机 unicodedata 同版本）。
 */
import * as fs from "fs";
import * as path from "path";

const EAW: { wide: number[][]; combining: number[][] } =
  JSON.parse(fs.readFileSync(path.join(__dirname, "eaw.json"), "utf8"));

function inRanges(ranges: number[][], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = ranges[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Python _dw：combining→0；W/F/A→2；其余 1。 */
export function dw(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (inRanges(EAW.combining, cp)) continue;
    w += inRanges(EAW.wide, cp) ? 2 : 1;
  }
  return w;
}

/** Python _cut：ord>0x2E80 算 2 列的简化规则（与 _dw 不同，语义如此）。 */
export function cut(s: string, w: number): string {
  let out = "";
  let cw = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)! > 0x2e80 ? 2 : 1;
    if (cw + c > w) break;
    out += ch;
    cw += c;
  }
  return out;
}

/** Python _pad：cut 后按 _dw 补空。 */
export function pad(s: string, w: number): string {
  return cut(s, w) + " ".repeat(Math.max(0, w - dw(s)));
}

/** Python _hard_wrap：按 '|' 段贪心折行，段整体挪行，单段超宽才钳断。 */
export function hardWrap(t: string, w: number): string[] {
  const out: string[] = [];
  let cur = "";
  let cw = 0;
  for (const raw of t.split("|")) {
    let seg = raw.trim();
    if (!seg) continue;
    let lead = cur ? 3 : 1;
    let sw = dw(seg);
    if (cur && cw + lead + sw > w) {
      out.push(cur);
      cur = "";
      cw = 0;
      lead = 1;
    }
    if (lead + sw > w) {
      seg = cut(seg, Math.max(1, w - lead));
      sw = dw(seg);
    }
    cur += (cur ? " | " : " ") + seg;
    cw += lead + sw;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Python _fold_wide：字符级折行（ord>0x2E80 算 2 列）。 */
export function foldWide(line: string, w: number): string[] {
  if (dw(line) <= w) return [line];
  const out: string[] = [];
  let cur = "";
  let cw = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0)! > 0x2e80 ? 2 : 1;
    if (cw + c > w) {
      out.push(cur);
      cur = "";
      cw = 0;
    }
    cur += ch;
    cw += c;
  }
  if (cur) out.push(cur);
  return out;
}

function stripBold(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1");
}

function mdTable(rows: string[], w: number): string[] {
  const body = rows.filter((r) => !(/^[ \t:|-]+$/.test(r) && r.includes("-")));
  const grid = body.map((r) =>
    r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")
      .map((c) => stripBold(c.trim())));
  if (!grid.length) return [];
  const ncol = Math.max(...grid.map((r) => r.length));
  const widths = Array.from({ length: ncol }, (_, i) =>
    Math.max(...grid.map((r) => (i < r.length ? dw(r[i]) : 0))));
  const out: string[] = [];
  for (const r of grid) {
    const s = widths.map((wd, i) => pad(i < r.length ? r[i] : "", wd)).join("  ");
    out.push(cut(s.trimEnd(), w));
  }
  return out;
}

/** Python _md_lines：表格对齐/标题/列表/围栏/粗体剥离 + foldWide。 */
export function mdLines(text: string, w: number): string[] {
  const out: string[] = [];
  let fence = false;
  const rawLines = text.split("\n");
  let i = 0;
  while (i < rawLines.length) {
    const ln = rawLines[i];
    if (ln.trim().startsWith("```")) {
      fence = !fence;
      i += 1;
      continue;
    }
    if (fence) {
      out.push("  " + ln);
      i += 1;
      continue;
    }
    if (ln.trimStart().startsWith("|") && i + 1 < rawLines.length &&
        rawLines[i + 1].trimStart().startsWith("|")) {
      let j = i;
      while (j < rawLines.length && rawLines[j].trimStart().startsWith("|")) {
        j += 1;
      }
      out.push(...mdTable(rawLines.slice(i, j), w));
      i = j;
      continue;
    }
    let s = ln.trimEnd();
    const hm = s.match(/^(#{1,})\s+(.*)$/);
    if (hm) {
      s = (hm[1].length === 1 ? "■ " : hm[1].length === 2 ? "▪ " : "· ") + hm[2];
    } else {
      const lm = s.match(/^(\s*)[-*] (.*)$/);
      if (lm) s = lm[1] + "• " + lm[2];
    }
    out.push(stripBold(s));
    i += 1;
  }
  const folded: string[] = [];
  for (const ln of out) folded.push(...foldWide(ln, w));
  return folded.length ? folded : [""];
}

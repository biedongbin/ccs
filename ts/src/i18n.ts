/** i18n：键值由 tools/dump_i18n.py 从 Python 版导出，零手工维护。 */
import data from "./i18n.json" with { type: "json" };

export type Lang = string;
const TABLE = data as Record<string, Record<string, string>>;
export const LANG_NAMES: [string, string][] = [
  ["zh", "中文"], ["en", "English"], ["ja", "日本語"], ["ko", "한국어"],
  ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["ru", "Русский"],
  ["pt", "Português"], ["it", "Italiano"],
];

let cur = "zh";

export function setLang(code: string): void {
  cur = TABLE[code] ? code : TABLE["zh"] ? "zh" : Object.keys(TABLE)[0];
}

export function curLang(): string {
  return cur;
}

/** 缺翻译回退 en，再缺回退 zh；{x} 占位替换。 */
export function T(key: string, params?: Record<string, string | number>): string {
  let s = TABLE[cur]?.[key] ?? TABLE.en?.[key] ?? TABLE.zh?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return s;
}

export function relTime(ts: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - ts);
  if (d < 60) return T("rel_now");
  if (d < 3600) return T("rel_m", { n: Math.floor(d / 60) });
  if (d < 86400) return T("rel_h", { n: Math.floor(d / 3600) });
  return T("rel_d", { n: Math.floor(d / 86400) });
}

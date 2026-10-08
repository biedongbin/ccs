/** 两页式配置面板（与 Python _config_tui/_detail_page 同构，无弹层）。 */
import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { CcsConfig, DEFAULT_RESUME_CMD, resumeCmdFull, userThemes, saveConfig, configPath, loadConfig } from "./config.js";
import { T, LANG_NAMES, setLang } from "./i18n.js";
import { cut, mdLines, pad } from "./width.js";

const DESC: Record<string, string> = {
  lang: "界面显示语言，共 10 种。影响菜单、提示、帮助行与错误文案。保存后下次启动生效。",
  theme: "配色主题（仅前景色，背景跟随终端）。default 青 / ocean 蓝 / dracula 紫 / mono 无色。深色终端建议 default 或 dracula，浅色终端建议 ocean 或 mono。自定义调色板自动追加在列表末尾。",
  resume: "恢复命令。只需填基础命令（如 cc）——按 Enter 恢复时系统自动追加 --resume {sid} 并替换为会话 ID；已含 {sid} 的完整模板同样兼容。整条命令交给你的交互 shell 执行，函数、alias、内嵌环境变量与终端行为一致。",
  custom: "自定义调色板：Enter 创建——输入主题名，选强调色与消息色（各 8 种，带色块预览），保存后自动启用；已有主题可使用或删除。强调色作用于边框/选中行，消息色作用于底部消息行。",
};

const THEME_NAMES = ["default", "ocean", "dracula", "mono"];
const COLOR_BLOCK: Record<string, string> = {
  black: "#555555", red: "#c73128", green: "#2e9e44", yellow: "#c79a28",
  blue: "#2f6fd8", magenta: "#a83bc7", cyan: "#2aa5a5", white: "#cccccc",
};

interface Row { key: string; label: string; value: string; desc: string; }

function rows(cfg: CcsConfig): Row[] {
  const customs = userThemes(cfg);
  return [
    { key: "lang", label: "语言 lang", value: String(cfg.lang || "zh"),
      desc: DESC["lang"] },
    { key: "theme", label: "主题 theme", value: String(cfg.theme || "default"),
      desc: DESC["theme"] },
    { key: "resume_cmd", label: "恢复命令 resume_cmd",
      value: resumeCmdFull(String(cfg.resume_cmd || DEFAULT_RESUME_CMD)),
      desc: DESC["resume"] },
    { key: "custom", label: "自定义调色板 custom", value: `${Object.keys(customs).length} 项`,
      desc: DESC["custom"] },
  ];
}

type Page =
  | { k: "list" } | { k: "lang" } | { k: "theme" } | { k: "resume_view" } | { k: "resume" } | { k: "custom" }
  | { k: "name" } | { k: "accent" } | { k: "msgc" };

export function ConfigApp({ cfgIn, onDone }: { cfgIn: CcsConfig; onDone: (saved: boolean) => void }) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ h: stdout.rows || 24, w: stdout.columns || 80 });
  useEffect(() => {
    const onR = () => setSize({ h: stdout.rows || 24, w: stdout.columns || 80 });
    stdout.on("resize", onR);
    return () => { stdout.removeListener("resize", onR); };
  }, [stdout]);
  const W = size.w, H = size.h;

  const [cfg, setCfg] = useState<CcsConfig>({ ...cfgIn });
  const [page, setPage] = useState<Page>({ k: "list" });
  const [sel, setSel] = useState(0);
  const [idx, setIdx] = useState(0);
  const [buf, setBuf] = useState("");
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [acc1, setAcc1] = useState("");
  const customs = userThemes(cfg);
  const rs = rows(cfg);

  const onKey = (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
    if (page.k === "name") {                                   // 新建：主题名（B1 语义：Esc 取消/退格/回车确认）
      if (key.escape) setPage({ k: "custom" });
      else if ((key.return || input === "\n")) {
        if (buf.trim()) { setNewName(buf.trim()); setBuf(""); setIdx(0); setPage({ k: "accent" }); }
        else setPage({ k: "custom" });
      }
      else if (key.backspace || key.delete) setBuf((b) => b.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBuf((b) => b + input);
      return;
    }
    if (page.k === "resume_view") {                            // R1-3: 两步式——先读说明，Enter 才编辑
      if (key.escape || input === "q") setPage({ k: "list" });
      else if (key.return || input === "\n") {
        setBuf(String(cfg.resume_cmd || DEFAULT_RESUME_CMD).replace(" --resume {sid}", ""));
        setPage({ k: "resume" });
      }
      return;
    }
    if (page.k === "resume") {                                 // resume 编辑（预填剥离基础命令）
      if (key.escape) { setMsg("已取消 cancelled"); setPage({ k: "list" }); }
      else if ((key.return || input === "\n")) {
        const v = buf.trim();
        if (v) { cfg.resume_cmd = v; setCfg({ ...cfg }); setMsg("已更新 updated"); }
        else setMsg("留空不改动 unchanged");
        setPage({ k: "list" });
      }
      else if (key.backspace || key.delete) setBuf((b) => b.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setBuf((b) => b + input);
      return;
    }

    const nav = (len: number) => (i: number) => Math.max(0, Math.min(i, len - 1));
    if (page.k === "list") {
      if (input === "q") { saveConfig(cfg); onDone(true); }
      else if (key.escape) onDone(false);
      else if (key.downArrow) setSel((s) => nav(rs.length)(s + 1));
      else if (key.upArrow) setSel((s) => nav(rs.length)(s - 1));
      else if ((key.return || input === "\n")) {
        setMsg("");
        const k = rs[sel].key;
        if (k === "lang") { setIdx(LANG_NAMES.findIndex(([c]) => c === (cfg.lang || "zh"))); setPage({ k: "lang" }); }
        else if (k === "theme") { setIdx(0); setPage({ k: "theme" }); }
        else if (k === "resume_cmd") {
          setPage({ k: "resume_view" });
        }
        else { setIdx(0); setPage({ k: "custom" }); }
      }
      return;
    }
    if (page.k === "lang") {
      if (key.escape || input === "q" || (key.tab || input === "\t")) setPage({ k: "list" });
      else if (key.downArrow) setIdx(nav(LANG_NAMES.length)(idx + 1));
      else if (key.upArrow) setIdx(nav(LANG_NAMES.length)(idx - 1));
      else if ((key.return || input === "\n")) {
        const c = LANG_NAMES[idx][0];
        cfg.lang = c; setCfg({ ...cfg }); setLang(c); setMsg(`✓ ${c}`);
        setPage({ k: "list" });
      }
      return;
    }
    if (page.k === "theme") {
      const items = [...THEME_NAMES, ...Object.keys(customs), "__new__"];
      if (key.escape || input === "q" || (key.tab || input === "\t")) setPage({ k: "list" });
      else if (key.downArrow) setIdx(nav(items.length)(idx + 1));
      else if (key.upArrow) setIdx(nav(items.length)(idx - 1));
      else if ((key.return || input === "\n")) {
        const pick = items[idx];
        if (pick === "__new__") { setBuf(""); setPage({ k: "name" }); }
        else { cfg.theme = pick; setCfg({ ...cfg }); setMsg(`✓ ${pick}`); setPage({ k: "list" }); }
      }
      return;
    }
    if (page.k === "custom") {
      const items = ["__new__", ...Object.keys(customs)];
      if (key.escape || input === "q" || (key.tab || input === "\t")) setPage({ k: "list" });
      else if (key.downArrow) setIdx(nav(items.length)(idx + 1));
      else if (key.upArrow) setIdx(nav(items.length)(idx - 1));
      else if (input === "d" && items[idx] !== "__new__") {
        const name = items[idx];
        const cu = { ...(cfg.custom as object || {}) };
        delete (cu as Record<string, unknown>)[name];
        cfg.custom = cu;
        if (cfg.theme === name) cfg.theme = "default";
        setCfg({ ...cfg }); setMsg(`已删除 ${name}`); setIdx(0);
      }
      else if ((key.return || input === "\n")) {
        if (items[idx] === "__new__") { setBuf(""); setPage({ k: "name" }); }
        else { cfg.theme = items[idx]; setCfg({ ...cfg }); setMsg(`✓ ${items[idx]}`); setPage({ k: "list" }); }
      }
      return;
    }
    if (page.k === "accent" || page.k === "msgc") {
      const names = Object.keys(COLOR_BLOCK);
      if (key.escape || input === "q") setPage({ k: "custom" });
      else if (key.downArrow) setIdx(nav(names.length)(idx + 1));
      else if (key.upArrow) setIdx(nav(names.length)(idx - 1));
      else if ((key.return || input === "\n")) {
        const c = names[idx];
        if (page.k === "accent") { setAcc1(c); setIdx(0); setPage({ k: "msgc" }); }
        else {
          const cu = { ...((cfg.custom as Record<string, unknown>) || {}) };
          cu[newName] = [acc1, c];
          cfg.custom = cu; cfg.theme = newName;
          setCfg({ ...cfg }); setMsg(`✓ 已创建并启用 ${newName}`);
          setPage({ k: "list" });
        }
      }
      return;
    }
  };
  useInput((raw: string, k: Parameters<typeof onKey>[1]) => {
    if (raw.length > 1 && /^[\x20-\x7e\u00a0-\uffff]+$/.test(raw)) {
      for (const ch of raw) onKey(ch, k);      // 纯可打印块（连击/粘贴）逐字符分发；含控制字符整包交原逻辑（分发链内 setState 异步，混控制符会读旧状态）
      return;
    }
    onKey(raw, k);
  });

  const header = <Text backgroundColor="cyan" color="black" bold>{` ccs 配置 / config — ${configPath()}`}</Text>;

  if (H < 12 || W < 60) return <Text>terminal too small</Text>;

  if (page.k === "list") {
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor>{"配置项".padEnd(20) + "当前值".padEnd(20) + "说明"}</Text>
        {rs.map((r, i) => {
          const selr = i === sel;
          const descLs = mdLines(r.desc, Math.max(10, W - 2 - 42));
          return (
            <Box key={r.key} flexDirection="column">
              <Text backgroundColor={selr ? "cyan" : undefined} color={selr ? "black" : undefined}
                bold={(selr || true) && selr}>
                {(selr ? "▸ " : "  ") + cut(r.label, 20) + "  " + pad(cut(r.value, 18), 18) + "  " + cut(descLs[0] || "", Math.max(10, W - 2 - 42))}
              </Text>
              {descLs.slice(1, 4).map((d, j) => (
                <Text key={j} backgroundColor={selr ? "cyan" : undefined} color={selr ? "black" : "gray"}>
                  {" ".repeat(44) + d}
                </Text>
              ))}
            </Box>
          );
        })}
        <Text dimColor>{" j/k 移动 move · Enter 进入详情 detail · q 保存退出 save · Esc 原样退出"}</Text>
        <Text color="yellow">{msg}</Text>
      </Box>
    );
  }

  const detailHead = (t: string) => (
    <Box flexDirection="column">
      <Text backgroundColor="cyan" color="black" bold>{` ← ${t}`}</Text>
      <Text> </Text>
    </Box>
  );
  const descBlock = (desc: string) => mdLines(desc, W - 4).slice(0, H - 8)
    .map((l, i) => <Text key={i} dimColor>{l}</Text>);

  if (page.k === "lang") {
    return (
      <Box flexDirection="column">
        {detailHead("语言 / language")}
        {descBlock(DESC["lang"])}
        <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
        {LANG_NAMES.map(([c, n], i) => (
          <Text key={c} backgroundColor={i === idx ? "cyan" : undefined} color={i === idx ? "black" : undefined}>
            {(i === idx ? "▸ " : "  ") + `${n} (${c})` + (c === (cfg.lang || "zh") ? "  ✓" : "")}
          </Text>
        ))}
        <Text dimColor>{" j/k 选择 · Enter 确认 · Esc 返回列表"}</Text>
      </Box>
    );
  }
  if (page.k === "theme") {
    const items = [...THEME_NAMES, ...Object.keys(customs), "__new__"];
    return (
      <Box flexDirection="column">
        {detailHead("主题 / theme")}
        {descBlock(DESC["theme"])}
        <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
        {items.map((t, i) => (
          <Text key={t} backgroundColor={i === idx ? "cyan" : undefined} color={i === idx ? "black" : undefined}>
            {(i === idx ? "▸ " : "  ") + (t === "__new__" ? "＋ 新建自定义主题 create" : t)
              + (t === (cfg.theme || "default") ? "  ✓" : "")}
          </Text>
        ))}
        <Text dimColor>{" j/k 选择 · Enter 确认 · Esc 返回"}</Text>
      </Box>
    );
  }
  if (page.k === "resume_view") {
    return (
      <Box flexDirection="column">
        {detailHead("恢复命令 / resume cmd")}
        {descBlock(DESC["resume"])}
        <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
        <Text color="green">{"当前完整命令: " + resumeCmdFull(String(cfg.resume_cmd || DEFAULT_RESUME_CMD))}</Text>
        <Text bold backgroundColor="cyan" color="black">{" ▸ 编辑基础命令 edit base command"}</Text>
        <Text dimColor>{" Enter 编辑 · Esc 返回列表"}</Text>
      </Box>
    );
  }
  if (page.k === "resume") {
    return (
      <Box flexDirection="column">
        {detailHead("恢复命令 / resume cmd")}
        {descBlock(DESC["resume"])}
        <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
        <Text color="green">{"当前完整命令: " + resumeCmdFull(String(cfg.resume_cmd || DEFAULT_RESUME_CMD))}</Text>
        <Text bold>{`resume_cmd + --resume {sid}: ${buf}▌`}</Text>
        <Text dimColor>{" Enter 确认 · Esc 取消"}</Text>
      </Box>
    );
  }
  if (page.k === "custom") {
    const items = ["__new__", ...Object.keys(customs)];
    return (
      <Box flexDirection="column">
        {detailHead("自定义调色板 / custom")}
        {descBlock(DESC["custom"])}
        <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
        {items.map((t, i) => (
          <Text key={t} backgroundColor={i === idx ? "cyan" : undefined} color={i === idx ? "black" : undefined}>
            {(i === idx ? "▸ " : "  ") + (t === "__new__" ? "＋ 新建 create" : t)
              + (t === cfg.theme ? "  ✓" : "")}
          </Text>
        ))}
        <Text dimColor>{" j/k 选择 · Enter 确认 · d 删除 · Esc 返回"}</Text>
      </Box>
    );
  }
  if (page.k === "name") {
    return (
      <Box flexDirection="column">
        {detailHead("新建主题 / create")}
        <Text>{DESC["custom"]}</Text>
        <Text bold>{`主题名 name: ${buf}▌`}</Text>
        <Text dimColor>{" Enter 确认 · Esc 取消"}</Text>
      </Box>
    );
  }
  const names = Object.keys(COLOR_BLOCK);
  const isAccent = page.k === "accent";
  return (
    <Box flexDirection="column">
      {detailHead(isAccent ? "强调色 accent（边框/选中行）" : `消息色 msg（底部消息行）— ${newName}/${acc1}`)}
      <Text dimColor>{isAccent ? "选择强调色——作用于边框/时间列/选中行底色。" : "选择消息色——作用于底部消息行。"}</Text>
      <Text dimColor>{"-".repeat(Math.max(4, W - 4))}</Text>
      {names.map((c, i) => (
        <Text key={c} backgroundColor={i === idx ? "cyan" : undefined} color={i === idx ? "black" : undefined}>
          {(i === idx ? "▸ " : "  ") + "██ "}
          <Text color={COLOR_BLOCK[c]}>{"  " + c}</Text>
        </Text>
      ))}
      <Text dimColor>{" j/k 选择 · Enter 确认 · Esc 返回"}</Text>
    </Box>
  );
}

# R1 独立审查报告（审查-修复循环 第 1/5 轮）

视角：交互行为实测（pty 全键位）+ 跨语言一致性 + 上轮修复回归。
起点全绿：build 0 错 / parity 61 / unit 49 / shell 4 / e2e 12。
基准：根目录 Python 版 `ccs`（HEAD 2c99fd4）。

## 发现

| # | 级别 | 位置 | 问题 | 证据 |
|---|---|---|---|---|
| R1-1 | **Important** | `src/app.tsx:47` | **默认目录过滤缺失**：`useState<string|null>(null)` → 过滤 `!project` 恒真，启动即全量列表。Python（ccs:1235）`st.project = realpath(getcwd())` 无条件锚定当前目录——无会话显示空列表，Esc 展开全部（用户明确要求过的行为）。在无会话目录启动 Node 版会看到全部 174 条 | 代码对照双方源码；fixture 下 Node 首屏 `ccs·3` 全量（cwd=ts 无会话） |
| R1-2 | Minor | `src/app.tsx` useInput / `src/configui.tsx` useInput | **input 多字符块未逐字符分发**：一次 read 到多个键（快速连击/粘贴含 DEL）时 `input="jj"` 不匹配 `=== "j"`、多 `\x7f` 被 append 成不可见字符（实测 resume 编辑 `claude`+10×DEL+`echoHI` → buf=`claudeechoHI`）。Python get_wch 逐字符无此坑。单键一切正常 | pty 实测：单退格 `claude→claud` ✓；10 退格同包 → 垃圾 append |
| R1-3 | Minor | `src/configui.tsx` resume 页 | 详情页进页即编辑态（与 Python 两步式 items→Enter 不一致），Esc 直接回列表而非保留查看——语义等价但**新用户无浏览仅说明的机会**；且该页无 items 列表与 Python 面板结构偏离 | pty dump：jj+Enter 直接出 `resume_cmd + --resume {sid}: claude▌` |

（R1-2/R1-3 为体验级；R1-1 为与基准语义背离，应修。）

## 实测通过项（证据留档于本审查 pty 会话）

- **搜索**：态提示/实时过滤/计数徽章/Esc 清空/无命中 `ccs·0`/Enter 保持过滤 — 6/6
- **rename**：预填现名/退格改写/落盘 custom-title/mtime 恢复不跳顶/Esc 取消 — 5/5（注：此前疑"提交失败"系审查者断言查错文件，rename 写的是游标行 c.jsonl，非误报）
- **归档**：A 徽章/a 移入 archive/Esc 退出归档区后主列表更新/d 进 trash/游标保位 — 5/5
- **J/K 滚动、y 复制、Ctrl+L 重扫** — 3/3
- **Tab picker**：开/关/选中项目过滤/会话数列/时间列（M5 回归 ✓）— 5/5（注：首测"聚合全 alpha"系审查者 fixture 造数错误——编码目录与 cwd 不配套时 Python 同输出，非 bug）
- **dir 补救**：询问行/输路径 mkdir+exec（目录已建、进程接管退出）/空回车取消 — 3/3
- **配置面板**：列表三列/说明折行/lang 详情+选 en 落盘/theme 详情+选 ocean 落盘/q 保存 saved/Esc 不落盘/custom 页 — 8/8
- **跨语言**：`--check` 逐行一致（同 fixture）；i18n 抽 zh/ja/ru 38 键零差异（除 help 已知平台替换）；resume argv 两态（基础命令/含 {sid}）均 `$SHELL -ic` — 3/3
- **上轮修复回归**：M1 carry（无尾换行 fixture first_user 提取 ✓）、M8 Enter 清屏（app.tsx:203 ✓ 读码）、M10 屏显 `Ctrl+L 重扫` ✓ — 3/3

## 计数与趋势

- 本轮：Important 1 / Minor 2（上轮 17 项 → 本轮 3 项，**降 82%**）
- 起点四套 + e2e 复跑全绿（审查零副作用）

## 修法建议

- R1-1：`useState<string | null>(fs.realpathSync.native(process.cwd()))`（try/catch 回退 process.cwd()）
- R1-2：useInput 回调入口对 `input.length > 1` 逐字符递归分发（两处组件同改）
- R1-3：resume 页加 items（`编辑基础命令` / `返回`），Enter 才进编辑（对齐 Python 两步式）

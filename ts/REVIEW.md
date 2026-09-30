# ccs Node 原生版 — 独立代码审查报告

审查者：独立审查 fork（未参与开发）。基线：`8f42103`（main）。
方法：逐模块人工比对 Python 版（根 `ccs`）+ 探针实跑验证，不接受静态推断。
基线四件套复核：build 0 错 / parity 61 组 / unit 49 / pty e2e 12 — 全绿（起点）。

## 发现总表

| # | 级别 | 位置 | 症状 | 验证 |
|---|---|---|---|---|
| C1 | **Critical** | `src/cli.ts:86` | ESM 入口判定 `import.meta.url === "file://"+process.argv[1]` 在 **symlink 下不等**（argv[1] 是链接路径，import.meta.url 是 realpath）→ `main()` 不执行，`ccs --check` 静默零输出。**npm 全局安装的 bin 恰是 symlink** → `npm i -g` 后命令哑火 | 探针：`ln -s dist/cli.js /tmp/x && node /tmp/x --check` 零输出；绝对路径直跑出数（P4/P5） |
| I1 | Important | `src/app.tsx:142` | dir 补救输入**绝对路径被拼进 homedir**：`os.homedir() + d` 对 `/tmp/foo` 产出 `/Users/me/tmp/foo`，再 mkdir+恢复到错误目录。Python `os.path.expanduser` 仅 `~` 前缀替换 | 探针 P1：input `/tmp/ccs_audit_abs` → `/Users/biedongbin/tmp/ccs_audit_abs` |
| I2 | Important | `src/app.tsx:201` + `src/resume.ts:51` | 无 sid 会话按 Enter：`execResume` 直接 `throw new Error("no sid")`，useInput 内未捕获 → **TUI 崩溃退出**。Python 显示 `no_sid` 消息继续 | 探针 P2：THROWS |
| I3 | Important | `src/resume.ts:62` + `src/app.tsx:204` | `$SHELL` 无效/spawn 失败：`sub.status` 为 null → `process.exit(null ?? 0)` = **退出码 0（假成功）**，无任何提示。Python `execvp` 失败 → `op_fail` 消息 | 探针 P3 |
| I4 | Important | `src/app.tsx:184-185` | PgUp/PgDn 详情翻页步长 = **1 行**；Python `KEY_PPAGE/NPAGE` = ±`list_h`（整页）。长详情翻页体验实质背离 | 代码实读（Python ccs 对应分支） |
| I5 | Important | `src/app.tsx:303` | 左栏滚动偏移是**派生式** `off = max(0,min(cursor,n-visH))`：cursor 在中段时选中行恒处窗口首行（每按 j 整窗跳变）；Python `_clamp_off` 是滞后窗口（off 不动直至 cursor 出窗才滚） | 数学推演（公式本身即证据）+ 与 Python `_clamp_off` 对照 |
| M1 | Minor | `src/parse.ts:170` | 全扫兜底 `carry` 永不 flush：**无尾随 `\n` 的最后一行被丢弃**（Python `for line in f` 会 yield）。真实 jsonl 恒有尾换行，影响面近零 | 推演（carry 逻辑无末次 flush） |
| M2 | Minor | `src/cli.ts:28` | `T("lang_names")` 无此键，T 缺键返回键名本身（truthy）→ fallback 恒不触发；变量随后未使用（dead code，无实害） | 读 i18n.ts T() 实现 |
| M3 | Minor | `src/config.ts:66` | `userThemes` 对 JSON `5.0`：Python `isinstance(int)` 拒（json.load 得 float），TS `Number.isInteger(5)` 收——不可达输入，无实害 | 语义比对 |
| M4 | Minor | `src/scan.ts:54` | clip.exe 编码 utf-16le（Python utf-16 带 BOM）；clip.exe 两种均接受 | 比对 |
| M5 | Minor | `src/app.tsx:292` + picker | picker 底部提示硬编码英文（Python 有 i18n）；picker 项缺 Python 版的会话数/时间列 | 代码实读 |
| M6 | Minor | `src/app.tsx:95-100,56` | `rescan`/`ticks` dead code；`rescan` 内 `scanAll()` 调两次 | 代码实读 |
| M7 | Minor | `src/app.tsx:196` | 重扫分支 cursor 逻辑引用旧闭包 `rows.length/n` 且表达式混乱（`rows.length ? n-1 : 0` 恒等于 `n-1` 分支）；行为上是"clamp 保位"，Python r 重扫 cursor 归 0——TS 更优但与基准不一致，建议简化为 `Math.min(c, n-1)` | 代码实读 |
| M8 | Minor | `src/app.tsx:204` | Enter 恢复退出未发清屏序列（q 分支有）；终端残留由被接管程序自绘覆盖，无实害 | 代码实读 |
| M9 | Minor | `test/tui.test.cjs:41` | `mtime order unchanged` 断言右半 `metas[0].mtime >= metas[1].mtime` 恒真（scanAll 本身保证降序）——弱断言 | 实读 |
| M10 | Minor | help 文案 vs 行为 | i18n help 全语言含 `F5 重扫`，但 ink 不透传 F5 转义序列，实际仅 Ctrl+L 生效（M3 已声明）——文案与行为不符建议 help 去掉 F5 或加 KEY_F5 处理 | 已知声明 |

## 已核对无偏差（抽查）

- parse：标题链/净化/500·4000 截断/sidecar 判定（latin1 字节层等价 Python bytes）/nlines 只计 head/launch_dir 两级消歧/joinSep 与 os.path.join 语义
- scan：sdk-cli 过滤/sidecar 覆盖条件（同不含 summary 检查，与 Python 一致）/mtime 排序稳定
- store：EXDEV 回退与 shutil.move 等价/trash `.1` 后缀不覆盖（parity 覆盖）
- config：resumeCmdFull rstrip 语义/userThemes bool 排除等价
- i18n：38 键 = Python I18N_KEYS 38 键，全量导出无缺口
- 工程：tsconfig strict 真开；.gitignore 含 ts/dist、node_modules；package.json files 含 dist、prepublishOnly 先 build；pack 演练 17 文件

## 测试盲区（修复 C1/I1 时应补）

1. bin symlink 场景（正是 C1 漏网处）：`npm pack` → 本地 `npm i -g <tgz>` → `ccs --check` 出数
2. dir 补救输入（I1 场景）进 pty_e2e：绝对路径/~/相对三种输入的落点断言
3. PgUp/PgDn 步长断言（I4）
4. no-sid Enter / 坏 SHELL 的非崩溃路径（I2/I3）

## 结论

**需修复后发布。** C1 直接废掉 npm 分发路径（全局装即哑火），必修；I1/I2/I3 均为用户可触发的错误行为，强烈建议随 C1 一并修复（合计改动 < 20 行）；I4/I5 为体验对齐项；Minor 可延后。修复上述后 Node 版与 Python 版语义对齐度良好，parity/单测/e2e 基础设施扎实。

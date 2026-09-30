# Node 版历史问题逐项验证报告（HISTORY_AUDIT.md 33 条 + 新发现 1 条）

> 验证方式：全部实测（pty 驱动 `node dist/cli.js` + pyte 帧断言 / 原始字节流分析 / stub shell / 诊断插桩），
> 不可实测的标 PASS-code。环境：TERM=xterm-256color，CCS_HOME/CCS_PROJECTS_DIR 隔离，pyte 见证。
> 复现探针：/tmp/hv_probe.py（固定窗口采集版）。

## 结论总览

**PASS 27 · PASS-code 3 · FAIL 3（A4 / B1 / B2）· 新发现 FAIL 1（N1 pager 静默退出）**

## A 层（curses 渲染 → ink 免疫性实证）

| ID | 结论 | 证据 |
|----|------|------|
| A1 | **PASS** | `o` 进 pager 后 30 行全 dump：无任何列表框线/双栏残留（框线字符扫描 0 命中），页头 `[1/91]` 正常 |
| A2 | PASS-code | ink 无 curses 差分刷新；A1 同证整屏无残影 |
| A3 | **PASS** | `--config` 列表页↔详情页反复进出帧一致，无半清半留 |
| A4 | **FAIL** | 空闲态原始流 5s=37143B（≈7.4KB/s，46 chunks）：500ms tick `setTicks((t)=>t+1)` **无条件 setState**，每 tick 全屏重绘 ×2 帧。Python 版 `timeout(500 if JOBS else -1)` 的"空闲零重绘"语义未复刻。闪屏风险+带宽浪费。**修复建议**：tick 内无事件且 ticks 未被用于渲染依赖时移除 setTicks，或 `pollJobs()` 返回空且无 JOBS 时跳过 setState |
| A5 | PASS | B12/A3 场景 Esc 即时生效（帧断言），无 ESCDELAY 现象 |
| A6 | PASS-code | 架构差异：ink 单缓冲树渲染，无 get_wch 隐式 wrefresh 问题 |

## B 层（交互语义）

| ID | 结论 | 证据 |
|----|------|------|
| B1 | **FAIL** | 单帧实证预填（`重命名 [问]: 问`）与 Esc 取消（无残留）均过；**但 rename 态存活不稳**——进入后 ~0.5-1s 被自动重置回列表（多次运行结果漂移：快输入可成功、慢输入被中断；原始流显示提示行出现后消失、尾部帧回帮助行）。归因 A4 无条件重绘流与 N1 同源的渲染/卸载链。**修复建议**：随 A4/N1 一并修（tick 无条件 setState 链），修后以 /tmp/hv_probe.py 复测 `r → 等 3s → 输入 → Enter` |
| B2 | **FAIL** | 同 B1：`r` 后等 1.5-3s 再输入，输入态丢失/竞态（对照：0.2s 内快速输入可成功） |
| B3 | PASS | 帮助行 110 宽折 2 行，段完整（`d 删`/`q 退出`/`F5 重扫` 均整段），无 ≤3 字符残段 |
| B4 | PASS | 键位代码 grep 无 meta/cmd 判定（命中皆为 SessionMeta 类型名） |
| B5 | PASS | rename 提示独占状态行（行 23），帮助行（24/25）无叠字 |
| B6 | PASS | C4 stub 实证：resume 直跑 `$SHELL -ic`（见 C4） |
| B7 | PASS | 配置面板两页式，无任何弹层 |
| B8 | PASS | `tsc --noEmit` strict 0 错；颜色页为显式对象结构 |
| B9 | PASS（附记） | 退出码直通实证：注入 assert.fail → exit 1；npm test && 链无管道。**附记**：验证中发现 parity 基准因 fixture mtime 漂移失效（显示 ALL PASS 但 exit 1），主会话曾以 `| tail` 判绿误读——已重生成基准（exit 0）。建议：dump_py.py 在 parity 前自动重跑，或对拍剔除 mtime 字段 |
| B10 | PASS | 历史坏名（realpathCwd/interface_bad/field_bad/placeholder_）grep 全空 |
| B11 | PASS | pager 内 `jj`：页头 `[1/91]→[3/91]`，内容上移，列表选中未变 |
| B12 | PASS | 搜索态按 `r`：改名提示未出现、搜索态保持；Esc 逐级返回正常 |

## C 层（解析/语义）

| ID | 结论 | 证据 |
|----|------|------|
| C1 | PASS | parity multiline 组：标题净化（`\s+→" "`）逐字节一致 |
| C2 | PASS | pty 实测：搜索框输入「登录」→ 命中「修复登录bug」过滤正确，无乱码 |
| C3 | PASS | parity width 组含 A 类（★·—é/西里尔）样本一致 |
| C4 | **PASS** | stub SHELL 落盘 argv = `-ic cc --resume sid-c4`：基础命令自动追加 ✓、一律 `$SHELL -ic` ✓（无 which 分支，clang 遮蔽不可能复发） |
| C4b | PASS | grep 无 which 探测分支 |
| C5 | PASS | ts/src 无 cache.json/CACHE_VERSION 读写 |
| C5b | PASS | 同上（无缓存即无版本污染） |
| C6 | PASS | parity ld 组含 realpath 归一用例 |
| C6b | PASS | launchdir_cases.json 6 用例全绿（hint 消歧/贪心解码/已删目录） |
| C7 | PASS | config/summary 写盘均 tmp+renameSync（审计实现；store 内 renameSync 为文件移动语义，正确） |
| C8 | PASS | 第二条会话改名 `ZZ`：ZZ 生效且列表首行仍是原第一条（未跳顶） |
| C9 | PASS | parity longreply 组：4000 截断逐字节一致 |
| C10 | PASS | parity md 组：表格对齐/标题/围栏/粗体一致（附注：超长无换行中文段 mdLines 返回单行的行为与 Python 一致性未单独断言，已在 parity 覆盖范围内） |
| C13 | PASS | 空目录启动：顶栏 `ccs · 0`、列表 0 行，不回退全量 |

## D 层（流程/发布）

| ID | 结论 | 证据 |
|----|------|------|
| D1 | PASS | `git log --format=%B` 无 Co-Authored-By/Claude trailer（3 处命中皆为语义性提及：包名 claude-code-sessions、cc() 注释、首 commit 标题） |
| D2 | PASS | `git ls-files | grep -i super` 空 |
| D3 | PASS-code | README 双语已述渠道与安装；"重启生效"提示由 npx/npm 安装语义天然覆盖（无旧实例问题） |

## 新发现（不在 33 条清单内）

| ID | 严重度 | 症状与证据 | 定位结论 |
|----|--------|-----------|----------|
| N1 | **高** | `o` 进 pager 后进程静默退出（exit 0，无错误栈）：短回复单会话场景必现；长内容场景以帧滞留形式出现；pty_e2e.py 场景 3 的 FAIL 与 EIO 同源 | 诊断插桩时间线：500ms tick 心跳在 `o` 后停止（TICK 探针 4135 后无输出）→ event loop 清空 → `beforeExit` 兜底 unmount/resolve → `main().then(exit(0))`。渲染函数本体执行成功（两帧 PROBE），死点在渲染提交/ink 布局层或组件树卸载链。加外部保活 interval 可绕过（进程存活）。**修复建议**：(a) `runTui` 不依赖 loop 持有——常驻保活或显式退出信号制；(b) 升级 ink 查已知 unmount-on-error 行为；(c) 沿用 `.hv_diag` 插桩法（本报告验证过程已验证有效）深挖布局层 |

## 复现工具（保留）

- `/tmp/hv_probe.py`：固定窗口 pty 采集（空闲重绘流下静默检测会死循环，勿改回）
- `/tmp/hv_shellstub`：resume argv 落盘 stub
- 诊断插桩法：cp dist → 注 `process.on("exit"/"uncaughtException")` + console.error 打点 → pty 复跑（依赖需放 ts/ 下可解析 node_modules）

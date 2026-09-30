# R2 审查报告（第 2/5 轮 · 数据边界 + 错误路径 + 发布工程）

HEAD=60136fe。起点全套绿（parity 61 / unit 49 / shell 4 / pty e2e 12 / tsc 0）。
历史已修项（REVIEW.md 17、REVIEW_R1.md 3、HISTORY_VERIFY）未重报。

## 发现（2 项）

| ID | 级 | 位置 | 问题 | 证据 | 修法 |
|---|---|---|---|---|---|
| R2-1 | **Important** | `src/app.tsx:246-249` | 详情字段值（title/cwd/branch/**sid**）构造为 `pad(label,5)+value` 整段**不截断**——ink Text 自动换行，超长值溢出到次行（Python 版每段 `_cut` 钳宽，永不溢出） | 250 字符 sid 实测：ID 行满宽 110 且**次行继续泄漏 sss**（pyte dump：row9 len=110 全溢、row10 `││ssss…`） | 构造时四字段值过 `cut(value, width - 5)`（width.cut） |
| R2-2 | **Important** | `src/summary.ts:25`（saveSummaries） | 固定 tmp 名 `summaries.json.tmp`——双开 ccs 并发写时 A rename 走 B 的 tmp → B `renameSync` **ENOENT 崩溃**（未捕获） | 双进程各写 60 次：writer 0 崩（`ENOENT rename .../summaries.json.tmp`，完整栈），最终文件仅 1 条（last-writer-wins） | tmp 名加进程标识：`summaries.json.${process.pid}.tmp`；竞态窗口随 pid 隔离消失，last-writer-wins 语义保留 |

撤销量：--check 超长 title 疑项核实撤销（`src/cli.ts:18` 已有 `slice(0,60)`+`padEnd(24)`，与 Python run_check 一致）。

## 实测通过清单（探针均落 /tmp，审查零副作用，工作区净）

**数据边界**
- 空列表（0 项目）：`ccs·0 [项目:cwd_empty]` + `0/0`，j/k/搜索/Esc×2/**o** 全存活；R1-1 空目录锚定回归 ✓
- 损坏 jsonl ×3：半行 JSON（M1 carry flush 后仍安全降级文件名）、**10MB 单行**（exit 0 无 OOM 崩溃）、BOM 开头（降级文件名，与 Python bytes 解析行为一致）
- emoji/旗帜/ZWJ 家庭组合标题：解析 + TUI 渲染存活（dw 不崩）
- 超长 title（240 CJK）：顶栏无溢出、--check 截 60 与 Python 一致
- 外部删除当前会话文件后按 r/Esc/s/a/d：全部存活（异常路径有兜底）

**错误路径**
- config.json 非法 JSON → 降级默认（--check exit 0）
- summaries.json 非法 → 降级空（同上）
- `~/.ccs` chmod 500 → 读路径不受影响（--check exit 0）
- SHELL 未设 → --check 正常（仅 resume 时走 /bin/sh 回退）
- PATH 无 claude 按 `s`：存活 + 消息反馈（spawn 失败被处理，无 unhandled error）

**发布工程**
- `npm pack` 实际解包：17 文件 = dist×13 + bin/ccs.js + ccs(Python) + README + package.json；**无 REVIEW/HISTORY/PORT 等 md 混入**（files 白名单有效）
- 包内 bin 直跑 `--check` exit 0；shebang 在
- 元数据：repository/homepage/license/keywords/engines 齐
- src(12 ts/tsx)↔dist(11 js + 2 json)：差 1 = ink-shim.d.ts（声明文件，正确不产 js）
- `npm ci --dry-run` 通过（lockfile 一致）

**R1 修复回归**：R1-1 空目录 0/0 ✓；R1-2 `jj` 连击分发（e2e 场景 2）✓；R1-3 两步式（e2e 4b 链）✓

## 计数与趋势

**Critical 0 · Important 2 · Minor 0** —— 17 → 3 → **2**

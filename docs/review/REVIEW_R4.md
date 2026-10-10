# R4 审查报告（第 4/5 轮：性能 + 资源泄漏 + 静态审读）

HEAD=5d1d78c。起点全套绿（parity 61 / unit 49 / shell 4 / e2e 12）。

## 发现（1 项）

| ID | 级别 | 位置 | 问题 | 证据 |
|---|---|---|---|---|
| R4-1 | **Important** | `src/summary.ts:55-61` | `startSummary` 的 `fs.openSync(outp,"w")` 交 spawn stdio 后**永不 close**——每次 `s` 键泄漏 1 个 fd，长跑会话累积（Python 版 JOBS.pop 后文件对象 GC 关闭，Node 数字 fd 无此语义） | 实测：10×startSummary 后 /dev/fd 12→22（每次+1）；修法：spawn 返回后立即 `fs.closeSync(fd)`（子进程已 dup 继承） |

## 实测通过项

**性能（2000 会话 fixture）**
- scanAll：Node cold 131ms / warm 87ms vs Python 86ms / 90ms——同级（<3× 容忍线内 1.5×）
- TUI 冷启（含 2000 条扫描+首帧）：0.27s（<3s）
- mdLines 20KB 5ms（1601 行）/ hardWrap 2KB 1ms / foldWide 20K CJK 2ms

**资源**
- fd 配对：parse.ts 80/88、161/206 open/close finally 配对 ✓（唯 summary.ts 一处漏，见 R4-1）
- q 退出：pty 实测 0.22s 退出、无进程残留（pipe stdio 下"挂起"为测试姿势假象——ink 需真 TTY）
- 内存：20×scanAll heap 增长 31.3MB（阈值 50MB 内）
- .out 孤儿：harvestSummaries maxAgeSec=120 与 Python 一致，启动收养+删除，无无界增长路径

**静态审读**
- app.tsx rows useMemo 依赖 [sessions,archiveView,project,query] 完整；helpLs [W] ✓
- store.ts EXDEV 回退（copy+unlink）**已存在**（22-31 行），跨设备 move 不炸
- width.ts 边界：dw("")=0 / cut(负宽)="" / mdLines(空,0) 安全降级不抛（UI 层 too_small 拦截 w 极端值）
- doRename mtime 恢复（utimes）与读 stat 间竞态：同进程顺序执行窗口极窄，会话文件单写者场景可接受（Python 同构）

**R3 修复回归（pty 实测）**
- rename 空输入：ja 界面 `名前変更 [标题]:` 后无预填旧名 ✓
- F5 文案：ja help 显示 `Ctrl+L再読込`（无空格语言命中）✓

**测试反审**
- parity 19 处 deepStrictEqual/strictEqual 全强断言；tui.test 24 条逐条过目无恒真（36 行 `>=` 为排序方向语义、57 行 every 防腰斩为真约束）；无覆盖假象

## 审查者自误排除（不计）

- pipe stdio 下 q"挂起"（ink 需 TTY，pty 复测 0.22s 退出）
- "8s 未渲染"（perf home 缺 config.json 触发首跑问答等输入——274 字节即问答提示）
- 首帧 0.02s 误匹配（初始化块含 "ccs"，改以标题栏渲染为基准 0.27s）

## 计数与趋势

**本轮：Important 1 · Minor 0**（17 → 3 → 2 → 3 → 1）

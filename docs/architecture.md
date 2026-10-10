# ccs 架构设计

> 状态描述文档，与代码同步演进。两版实现：Python（`ccs` 单文件）与 Node/ink（`ts/`），功能等价、共用 `~/.ccs/` 数据，由字节级 parity 测试锁定一致。移植路线详见 [port-node.md](port-node.md)。

## 总体形态

```
~/.claude/projects/<编码目录>/<uuid>.jsonl     ← Claude Code 会话存储（只读）
        │ scan / parse
        ▼
┌─────────────────────────────────────┐
│  TUI（主从双栏）                       │
│  左：会话列表（排序/过滤/搜索）          │
│  右：详情（首尾指令/最后回复/元数据）      │
└─────────────────────────────────────┘
        │ archive / trash / rename / summary
        ▼
~/.ccs/   cache.json（索引） · archive/ · trash/ · summaries.json · config.json
```

核心约束：**绝不写 `~/.claude/projects/`**（唯一例外：rename 追加 `custom-title` 记录——与官方 `/rename` 同构）；**永不 `rm`**，删除/归档全部是 `shutil.move` 原子移动。

## 数据层（两版同构）

### 解析（`parse_jsonl` / `parse.ts`）

- 只采样头部 64KB + 尾部 64KB（超大文件不全读）；`/compact` 样板挤出真实指令时触发**全文件扫描兜底**
- `feed(line, part="head"|"tail")` 分段收集：head 段产出首问序列与 `cmds`，tail 段产出 `cmds_tail` 与 `all_cmds_acc`
- 字段产出：`first_cmds`/`last_cmds`（首尾各 3 条）、`all_cmds`（head 全序 + tail 全量，合并去重保序，≤80 条 × 200 字符）、`last_reply`（4000 字符预算）、`summary`、`gitBranch`
- **sidecar 折叠**：subagent/支线 jsonl 折入父会话；`entrypoint: sdk-cli` 衍生会话（compact 副产品）隐藏
- 样板过滤：`INTERNAL_PREFIXES`（`/clear`、`<command-name>`、continuation、"Base directory for this skill" 等）

### 标题链（对齐官方 picker）

`custom-title` > `ai-title` > summary > 首条真实用户消息 > 文件名

### 启动目录反解

编码目录名 `-` 双向编码（`_/./` 全压 `-`）反推出真实启动目录；`launch_dir` 做 realpath 归一符号链接；worktree 启动折回主仓库。

### 缓存

`cache.json` 按 `路径+mtime` 键控，`CACHE_VERSION`（当前 20）不匹配整体失效。解析语义任何变更必须 +1。两版键格式一致，缓存互通。

## 展示层

- **宽度**：CJK 双宽计算（`_dw`/`_cut`/`_pad`），Node 侧用 `eaw.json`（East Asian Width 数据表）对齐；`_md_lines` 轻量 markdown 渲染（表格对齐/标题/列表符，剥围栏与 `**`）。策略：宁宽勿窄
- **i18n**：44 键 × 10 语言，**Python 单源**（`_LANG_DATA`），`tools/dump_i18n.py` 导出 `ts/src/i18n.json`——零手工翻译、零漂移
- **主题**：4 内置 + 自定义调色板（accent + msg 两色，支持 256 色整数）

## 关键机制

| 机制 | 设计 |
|---|---|
| 恢复（resume） | `chdir` 回会话原启动目录 + `execvp` 当前终端原地接管；命令经 `$SHELL -ic` 执行（函数/alias 生效）；`resume_cmd` 只填基础命令，`--resume {sid}` 自动追加，含 `{sid}` 的完整模板同样兼容 |
| 搜索三键 | `/` 标题/路径/ID；`?` 全文（`all_cmds` + AI 总结 + `last_reply`）；`S` 语义搜索（后台 `claude -p`，默认 15 天 mtime 窗，查询含时间词则放开，≤100 候选） |
| 后台任务 | Python curses `timeout()` 轮询 / Node `setInterval` 轮询同一 `JOBS` 结构；AI 总结与语义搜索不阻塞 UI，切换会话不打断 |
| 键盘 | Python `get_wch` **不组装 keypad 转义序列**——`_read_key()` 组装层映射 ESC 序列（↑↓/PgUp/PgDn/F5）；全 UI 仅 ↑↓ 移动，无 j/k；终端会截留 Cmd 系按键，故重扫为 F5/Ctrl+L |
| 防闪烁 | 空闲零重绘（curses 差分更新 + `newwin/touchwin` 弹层） |
| rename 不改 mtime | 追加 `custom-title` 记录时保留文件 mtime，列表不跳顶 |

## 双版一致性纪律

1. **parity 测试**：`tools/dump_py.py` 导出 Python 基准 JSON → `ts/test/parity.cjs` 逐字节对拍 Node 输出（61 组：parse 16 / launch-dir 6 / scan 14 / width / store）。基准比较前剥 repo 根前缀（检出位置无关），mtime 跳过（checkout 脆性）
2. **i18n 单源**：改语言文本只改 Python，重新导出
3. **schema 同步**：任一侧新增解析字段，另一侧必须同步 + 基准重生成 + CACHE_VERSION +1
4. **互操作验收**：config.json / summaries.json 两版互读

## 测试体系

| 套件 | 规模 | 说明 |
|---|---|---|
| `test_ccs.py` | 53 项 | assert 式无框架，Python 全逻辑 |
| `ts/test/parity.cjs` | 61 组 | 双版字节级对拍 |
| `ts/test/*.test.cjs` | 3 文件 | resume/summary/tui 逻辑单测 |
| `ts/test/pty_e2e.py` | 21 场景 | pty+pyte 真终端渲染断言（ink CJK 对齐空格已归一） |
| shell | 4 项 | spawn/bin 入口 |

测试一律经 `CCS_HOME`/`CCS_PROJECTS_DIR` 环境变量隔离，**永不触碰真实 `~/.claude/projects`**。

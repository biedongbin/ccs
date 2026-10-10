# ccs 功能需求

> v1.1.2 已交付需求清单。上游设计动机见 [architecture.md](architecture.md)。

## 1. 定位

跨目录 Claude Code 会话管理器：浏览、搜索、归档、原地恢复。解决官方 `--resume` 只列当前目录、元数据稀少、无法归档的问题。

## 2. 功能需求

### R1 跨目录浏览

- 单列表呈现所有项目的会话；启动时锚定当前目录，`Esc` 展开全部
- 按 mtime 降序；subagent/sidecar 折入父会话；`sdk-cli` 衍生会话隐藏
- 标题四级降级链，样板零泄漏

### R2 原地恢复

- `Enter` 在当前终端 `exec` 接管，回到会话当初的启动目录
- 原目录已删 → 询问恢复目标（留空取消），不存在可代建；**绝不静默降级到当前目录**
- `resume_cmd` 可配：只填基础命令自动追加 `--resume {sid}`；完整模板兼容；`$SHELL -ic` 执行使 alias/函数生效

### R3 搜索

| 键 | 域 | 说明 |
|---|---|---|
| `/` | 标题 / 项目路径 / 会话 ID | 增量，大小写不敏感 |
| `?` | 全文 | 会话内**所有**用户指令（`all_cmds`）+ AI 总结 + 最后回复 |
| `S` | 语义 | 后台 `claude -p` 语义匹配，默认 15 天窗，查询含时间词则放开；命中集过滤列表，`Esc` 清除 |

- 搜索结果浏览：搜索态下 `↑↓` 直接移动选中项
- 搜索态 `j/k` 是普通查询字符（非移动键）

### R4 详情栏

- 首尾指令：前 3 / 后 3 条用户指令，中间以 `⋯` 分隔；**多行指令整条渲染**（续行缩进对齐）
- 最后回复、项目、分支、会话 ID、mtime——纯文本，鼠标原生可选复制
- `o` 全屏阅读（↑↓ 滚动 / Space 翻页 / g/G 首尾 / q 返回），markdown 轻渲染

### R5 会话操作

- `r`/`R` 重命名 = 官方 `/rename` 同构（追加 `custom-title`），不改 mtime、不跳顶
- `a`/`u` 归档/还原：`~/.ccs/archive/<项目>/`，按来源项目分目录
- `d` 软删除：`~/.ccs/trash/`，重名加 `.1`/`.2` 后缀不覆盖；**永不 `rm`**
- `y`/`Y` 复制首指令/最后回复（macOS `pbcopy`，Windows `clip.exe`，缺失时明示）
- `s` AI 总结：后台 `claude -p`，结果入 `~/.ccs/summaries.json`（pid 后缀临时文件原子写），详情栏顶部展示，非阻塞

### R6 配置

- `--config` 两页面板：列表页（配置项/当前值/说明自动换行）→ `Enter` 进详情页查看与修改
- 首次运行无 `~/.ccs/config.json` → 引导式配置（语言 + 主题），不受两页面板影响
- `lang`（10 语言）/ `theme`（4 内置 + 自定义调色板可视化创建，无手写 JSON）/ `resume_cmd`
- 环境变量 `CCS_HOME`/`CCS_PROJECTS_DIR` 重定向数据根（测试缝隙）

### R7 分发

- 三渠道：`npx claude-code-sessions` / `npm i -g`（`ccs`=Node 版、`ccs-py`=Python 版）/ curl 脚本（纯 Python）
- npm 包双 bin 共存，共用 `~/.ccs/` 数据；Windows 补 `windows-curses` 后 best-effort 支持

## 3. 非目标

- 不写 `~/.claude/projects/`（rename 追加 custom-title 记录除外）
- 永不 `rm` 会话文件
- 不绑定任何多路复用器（cmux/Tmux 皆可，恢复就在当前终端）
- npm 发布暂缓（用户明确挂起，待令执行）

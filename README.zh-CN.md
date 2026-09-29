<h1 align="center">ccs</h1>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/🇺🇸_English-read_in_english-blue?style=for-the-badge" alt="English"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/python-3.9+-green?style=flat-square" alt="Python 3.9+">
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" alt="License">
</p>

> **单文件终端 TUI，跨工作目录管理 Claude Code 会话。**
> 浏览、搜索、归档，并把任意会话恢复到它当初被打开的目录。
> 纯 Python 3 标准库，零依赖，单文件。

---

## 10 秒了解

Claude Code 内置的 `--resume` 选择器只列**当前目录**的会话、元数据稀少、也不能归档。项目一多，找「上周在另一个仓库里的那段对话」就成了考古。

**ccs** 直接读取 `~/.claude/projects/`，用一个主从双栏 TUI 一次解决：所有项目里由人打开过的会话进同一张列表，标题干净，详情栏可复制，一键恢复——**回到会话当初被启动的那个目录**。

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
ccs
```

就这样。选中会话，回车，当前终端原地接管恢复——回到会话当初的启动目录。

## 一览

| 能力 | 含义 |
|---|---|
| 跨目录浏览 | 所有项目的会话一张列表看完；默认当前目录，`Esc` 展开全部 |
| 从哪打开就恢复到哪 | 启动目录从编码项目路径还原——不折叠、不归组、不猜 git 根 |
| 干净标题 | `/clear`、`<command-name>`、续接样板、subagent 支线绝不泄漏；真实首问在 64 KB 头部采样之外也能找到 |
| 详情栏 | 首条提问、最后回复、项目、分支、会话 ID——纯文本，鼠标原生可选中复制 |
| 归档 / 还原 / 软删除 | 会话只移动到 `~/.ccs/` 下，永不 `rm` |
| 10 语言、4+ 主题 | 界面语言与配色可配置；支持自定义调色板 |
| SDK 噪音过滤 | `entrypoint: sdk-cli` 衍生会话（compact 副产品）隐藏 |

## 安装

一键安装（macOS / Linux，无需 clone）：

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
```

或从源码：

```bash
git clone https://github.com/biedongbin/ccs.git && cd ccs
chmod +x ccs && ln -sf "$(pwd)/ccs" ~/.local/bin/ccs
```

### Windows

Windows 的 Python 标准库不带 curses——先装补齐包，再用 `python` 运行：

```powershell
pip install windows-curses
curl.exe -fsSL -o ccs https://raw.githubusercontent.com/biedongbin/ccs/main/ccs
python ccs          # 或: Set-Alias ccs "python <路径>\ccs"
```

Windows 差异须知：

- **终端**：请用 Windows Terminal。传统控制台 conhost 的 CJK 宽度计算错乱，双栏布局会花。
- **剪贴板**：`y` / `Y` 走 `clip.exe`（pbcopy 仅 macOS）；两者都缺时 ccs 明确提示，不影响其他功能。
- **稳定性说明**：核心逻辑（解析/缓存/归档）为纯 Python 且有测试覆盖；curses 渲染路径在 macOS/Linux 上开发验证，Windows 属尽力兼容（best-effort）。

## 使用

```bash
ccs            # TUI（只显示当前目录的会话，无则空列表；Esc 查看全部）
ccs -a         # 直接进入归档区
ccs -r         # 忽略缓存全量重扫
ccs --config   # 交互式配置语言 / 主题
ccs --check    # 非交互：统计会话/项目/归档数与最新标题
```

首次启动检测到 `~/.ccs/config.json` 不存在时，自动进入引导配置（语言 + 主题）。

| 键 | 动作 |
|---|---|
| ↑/↓ 或 j/k | 移动 |
| `/` | 搜索（标题 / 项目 / 会话 ID，大小写不敏感） |
| Tab | 项目过滤弹层（Enter 确认，Esc 取消） |
| Enter | 在当前终端原地恢复：chdir 回会话原启动目录，exec 接管（命令模板可配，见 `resume_cmd`） |
| a / u | 归档 / 还原 |
| A | 归档区 ↔ 主列表 |
| d | 软删除（移入 `~/.ccs/trash/`，见下文） |
| J / K | 滚动右侧详情 |
| o | 全屏阅读当前会话详情（j/k 滚动、Space 翻页、g/G 首尾、q 返回列表）——AI 总结较长时看得完整 |
| y / Y | 复制首条提问 / 最后回复到剪贴板（pbcopy） |
| r / R | 重命名会话——等同 Claude Code 内 `/rename`（追加 `custom-title` 记录，官方 picker 同样显示） |
| s | AI 总结：后台 `claude -p` 分析该会话（核心目标/进度%/分支状态/问题清单），结果存 `~/.ccs/summaries.json` 并显示在详情栏顶部；异步不阻塞——切换会话不打断 |
| F5 或 Ctrl+L | 重扫（终端应用会截留 Cmd 系按键，故不用 Cmd+R） |
| Esc | 永远是「返回」：关弹层 → 清搜索/过滤 → 退出归档区 |
| q | 退出 |

## 归档与删除：永无真删除

两个操作都是原子文件移动（`shutil.move`）——ccs 绝不执行 `rm`：

| 操作 | 文件去向 | 如何找回 |
|---|---|---|
| `a` 归档 | `~/.ccs/archive/<项目>/<uuid>.jsonl`（按来源项目分目录） | 归档区（`A` 进入）里按 `u`，原路移回原项目目录 |
| `d` 删除 | `~/.ccs/trash/<uuid>.jsonl`（重名自动加 `.1`、`.2` 后缀，不覆盖） | 手工把文件移回 `~/.claude/projects/<项目>/`，列表即刻重新出现 |

两者的共同副作用：文件离开 `~/.claude/projects/` 后，`claude --resume` 官方 picker 也不再列出它。ccs 不碰 Claude Code 内部状态——文件放回去，一切如初。

## 恢复语义

会话的目录 = 当初运行 Claude Code 的目录 — 从 `~/.claude/projects/` 编码目录名还原，不折叠、不归组、不猜 git 根：

- **原目录健在** → 原地恢复（绝大多数会话）。
- **原目录已删** → 手动输入恢复目录（留空 = 取消）。输入的目录不存在时，询问是否自动创建。
- 恢复命令可整条替换（`resume_cmd`），不绑定任何多路复用器——不用 cmux/Tmux 的团队照常使用。

## 配置

`~/.ccs/config.json` — 直接编辑，或重跑 `ccs --config`。

| 选项 | 默认 | 说明 |
|---|---|---|
| `lang` | `zh` | 界面语言：`zh en ja ko es fr de ru pt it` |
| `theme` | `default` | `default`（青）· `ocean`（蓝）· `dracula`（紫）· `mono`（无色） |
| `resume_cmd` | `claude --resume {sid}` | 恢复命令模板，`{sid}` 替换为会话 ID，`Enter` 执行；可直接编辑本文件或 `ccs --config` 交互设置。示例：`"claude --dangerously-skip-permissions --resume {sid}"` |
| `custom` | — | 自定义调色板，见下 |

### 自定义主题

每条为 `[强调色, 消息色]` — 强调色作用于边框/时间列/选中行底色，消息色作用于底部消息行。颜色取 8 色名（`black red green yellow blue magenta cyan white`）或 `0–255` 整数（256 色终端）；非法条目静默忽略：

```json
{
  "theme": "nord",
  "custom": { "nord": ["cyan", 114] }
}
```

自定义主题自动出现在 `ccs --config` 主题菜单中。

## 说明

- **数据布局** — 只读访问 `~/.claude/projects/`，不改 Claude Code 内部状态；ccs 自身数据在 `~/.ccs/`（`cache.json` 按路径+mtime 失效、`archive/`、`trash/`）。
- **主题渲染** — 静态 curses 色对，背景跟随终端。深色终端选 `dracula` / `default`，浅色终端选 `ocean` / `mono`。
- **schema 演进** — 标题四级降级链（sidecar summary → 文件内 summary → 首条真实用户消息 → 文件名）兜底，解析永不抛错。
- **测试缝隙** — 环境变量 `CCS_PROJECTS_DIR` / `CCS_HOME` 可重定向两个根目录。

## FAQ

**为什么列表里的会话比磁盘上的文件少？** 两层过滤：subagent/sidecar 文件折入父会话；`sdk-cli` 衍生会话（compact 副产品、从未被人打开）隐藏。

**安装后 `ccs: command not found`。** `~/.local/bin` 不在 `PATH` — 把 `export PATH="$HOME/.local/bin:$PATH"` 加入 `~/.zshrc` / `~/.bashrc`。

**会话的原目录没了。** ccs 会询问恢复到哪里（留空取消），目录不存在时可选择自动创建；绝不静默降级到当前目录。

**详情栏能用鼠标选中复制吗？** 能 — ccs 刻意不捕获鼠标事件，终端原生选择直接可用。

## 测试

```bash
python3 test_ccs.py    # assert 式，无框架，46 项检查
```

## 许可

[MIT](LICENSE)

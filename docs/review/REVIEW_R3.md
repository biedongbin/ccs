# R3 审查报告（第 3/5 轮）—— 全键位行为矩阵 + i18n 完整性 + 文档真实性

HEAD=650ad73。起点全套绿（parity 61 / unit 49 / shell 4 / e2e 12）。

## 发现（3 项）

| ID | 级别 | 位置 | 问题 | 证据 |
|---|---|---|---|---|
| R3-1 | Important | `src/app.tsx` r/R 分支 | 改名**预填现名**，用户输入追加在旧名后（customTitle="中日英混排タイトル テスト新名字R3"）。Python `_prompt` 为**空输入**——用户输的是全名。语义背离且改名结果被污染 | pty 实测追加行 `{"customTitle":"中日英混排タイトル テ スト新名字R3"}`；Python `ccs` 源 `_prompt` 无 initial |
| R3-2 | Important | `src/i18n.ts` T() help 替换 | M10 的 `s.replace(/F5 /g, "Ctrl+L ")` 要求 F5 后带空格——ja 为 `F5再読込`（无空格）替换失效，ja 界面 help 仍显示不可用的 F5 | `setLang('ja'); T('help').includes('Ctrl+L')` → false；pty ja 屏显含 "F5"；ru（有空格）正常 |
| R3-3 | Minor | README.md:108 / README.zh-CN.md:108 | 键表 `F5 或 Ctrl+L` 对 Python 版准确，但 Node 版 F5 不生效（ink 不透传）——双版共用文档未注明差异 | 键位矩阵实测（Node 仅 Ctrl+L 生效） |

## 全键位矩阵（Python README 键表逐行，Node 实测）

| 键 | 结果 | 证据 |
|---|---|---|
| ↑↓jk / g / G | PASS | 游标移动/首末条详情字段断言 |
| / 搜索（CJK 增量、无结果、Esc 清） | PASS | 「搜索」过滤 ccs·1；「不存在xyz」→ ccs·0；Esc 回 ccs·3 |
| Tab picker（全部/选项目/过滤生效） | PASS | Tab→全部 ccs·4；j+Enter→他项目仅其会话 |
| Enter 恢复 | PASS | stub SHELL 捕获 `ARGV:-ic claude --resume sid-c`、cwd=`/private/tmp/ccs_r3_cwd`（realpath 归一正确）、退出前 `\x1b[2J\x1b[H`、TUI 接管退出 |
| a 归档 / u 还原 / A 归档区 / d 软删 | PASS | 落点 `~/.ccs/archive/-tmp-ccs-r3-cwd/`、还原回原目录 3 文件、trash 1 文件、归档区 `ccs·1【归档区】` |
| a 后游标保位 | PASS | G→a 后 1/2（不回顶） |
| J/K 滚详情 | PASS | 存活+布局稳定 |
| o pager（j/k/Space/b/g/G/q） | PASS | 长内容 32 页：Space 前进、G clamp 到 `[5/32]`（**与 Python 同 clamp 语义**，非页码==总页）、b 回翻、g 回顶、q 返回 |
| y / Y 复制 | PASS | pbcopy stub 捕获首问文本 + 「已复制」消息 |
| r/R 改名 | PASS* | 追加行字段（type/customTitle/sessionId）与 Python json.dumps 结构一致；*但见 R3-1 预填问题 |
| s AI 总结 | PASS | stub claude 捕获 `-p "请读取…"`（与 Python build_summary_argv 逐字同源）；发起→500ms 收割→「总结完成」→详情栏显示 STUB 输出 |
| Ctrl+L 重扫 | PASS | 存活+列表刷新 |
| Esc 逐级 | PASS | 清搜索→（Python 语义逐级） |
| q 退出 | PASS | 字节流含 `\x1b[2J` + `\x1b[H`，进程退出 |

**审查者假阴 6 起**（复核后排除，不计发现）：pyte 断言未去 ink CJK 对齐空格 ×3；a/A 分离 run 致数据不接续；Enter cwd 断言未计 realpath(/tmp→/private/tmp)；pager G "到底"误解为页码==总页（实为 clamp 语义，与 Python 一致）。

## i18n 完整性

- **10 语言 × 38 键逐键 diff：零差异**（Python `_LANG_DATA` vs `ts/src/i18n.json`）
- T() 参数替换 `{n}/{t}/{v}` 抽验 PASS（title/rel_m/badge_proj）
- ja/ru 主界面 pty 屏显 PASS（検索/поиск 均渲染）
- 未知语言码回退、缺键返回键名：PASS
- **R3-2**：ja 的 help F5 替换失效（见上）

## 文档真实性

- 「47 项检查」✓（test_ccs.py 恰 47 个 test 函数）
- npm 包名 claude-code-sessions / bin 双入口（ccs=Node、ccs-py=Python 壳）✓ 与 package.json 一致
- resume_cmd 基础命令语义 / 归档布局 ✓ 与实测一致
- **R3-3**：F5 键表未注明 Node 版差异（见上）

## R2 修复回归

- 长 sid（250 字符）详情 ID 行截断：PASS（屏面无 60+ 连续 L，右栏不溢出）

## 计数与趋势

**Important 2 · Minor 1 —— 17 → 3 → 2 → 3**（本轮 2 I 为新视角键位矩阵/i18n 深挖所出，R3-2 属 M10 修复的残留缺口）

结论：键位矩阵/i18n/文档三层实测后，Node 版与 Python 基准的行为等价度良好；R3-1/R3-2 修复后本轮清零。

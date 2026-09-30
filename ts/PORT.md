# B 线：TypeScript/Node 原生版移植路线

> 目标：与 Python 版功能对齐的纯 Node 发行形态，最终替换 npm 包 `claude-code-sessions` 的 bin，
> 与 Python 版并存（用户按需选择）。Python 版保持不变，两版共用 `~/.ccs/` 数据与配置。

## 里程碑

| # | 里程碑 | 验收 |
|---|---|---|
| M1 | **核心层移植 + 对拍**：`src/parse.ts`（jsonl 解析、标题链 custom-title>ai-title>summary>首问、内部前缀过滤、sidecar 折叠、启动目录反解 realpath）、`src/cache.ts`（v15 键格式与 Python 一致）、`src/model.ts` | 对拍测试：同一批 fixture 上 `parse.ts` 输出 JSON 与 `ccs`（import 后调用 parse_jsonl）逐字段 diff 为空 |
| M2 | **归档/恢复/回收**：`src/store.ts`（archive/restore/trash，同 Python 路径布局） | 对拍：do_archive/do_restore/do_trash 两版落盘路径一致 |
| M1.5 | **展示层移植**：`src/width.ts`（`_dw`/`_cut`/`_pad`/`_hard_wrap` 段折行、`_md_lines` markdown 轻渲染，宁宽勿窄策略对齐） | 渲染函数对拍：同输入同输出 |
| M3 | **TUI（ink）**：双栏列表+详情、增量搜索、o 全屏阅读、配置面板两页式 | pty 截图对比 Python 版关键屏 |
| M4 | **resume/exec**：`$SHELL -ic`、`resume_cmd` 基础命令+自动追加、原目录缺失询问流程 | 手工 + 脚本验证 |
| M5 | **AI 总结**：JOBS 轮询、summaries.json 共享 | 与 Python 版互读对方写的 summaries.json |
| M6 | **收尾**：README 安装节加"纯 Node 版"渠道、npm bin 切换、发布 | `npx claude-code-sessions` 跑的是 Node 版 |

## 对拍方法（M1/M1.5/M2 的硬验收）

`test/parity/` 下放共享 fixture（真实会话 jsonl 的脱敏样例 + 边界样例），
Python 侧导出 JSON（`ccs` 可被 import，写 `tools/dump_py.py` 导出），
Node 侧同 fixture 出 JSON，两个 JSON 必须逐字节一致。

## 现状

- [x] npm 壳包（A 线）：`ts/` 即包根，`bin/ccs.js` spawn 捆绑的 ccs
- [ ] M1 起逐里程碑推进（每步对拍验收后再进下一块）

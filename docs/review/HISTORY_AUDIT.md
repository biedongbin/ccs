# ccs Python 版历史问题清单（会话记录审计）

> 来源：仓库 git log 16 commits、会话 transcript 提取的 757 条用户消息、compaction 摘要。
> 用途：Node 版逐项验证，避免复发。每条给可执行验证点。
> 分层：**A**=ink 全量重绘天然免疫（curses 渲染层）；**B**=交互语义需等价防护；**C**=解析/语义移植易复发。

## A 层：curses 渲染坑（ink 全量重绘 → 天然免疫，仍需目验）

| ID | 症状 | 根因 | Python 修法 | Node 验证点 |
|----|------|------|------------|-------------|
| A1 | `o` 全屏阅读时下层双栏文字渗出 | macOS curses refresh 差分丢弃纯垫白行 | 独立 newwin + touchwin 整窗强推 | ink 全量重绘；验证：`o` 打开后整屏无下层残留（pty 截图逐行 diff） |
| A2 | 垫白后行内容部分残留 | 向行写恰好 W 列字符吞掉整行更新 | 禁止全宽写，统一 `W-1` | 不适用（无 curses）；ink 需验证整屏组件无渲染残影 |
| A3 | 弹层关闭后下层 UI 花屏（半清半留） | erase+overlay 被 curses 差分吞 | picker 改 overlay 不 erase；两页式后消除 | 配置面板页切换无残影；验证：反复进出详情页 pty 帧一致 |
| A4 | 空闲时屏幕频繁闪烁 | 每 500ms tick 全屏重绘 | `timeout(500 if JOBS else -1)` 空闲零重绘 | ink 默认静态；验证：空闲 5s 输出字节 0 |
| A5 | 独立 Esc 响应迟缓 | ncurses ESCDELAY 默认 1s | 测试侧 `ESCDELAY=0` | 无 curses 无此问题；ink Esc 即时；验证：Esc 后 <100ms 响应 |
| A6 | 偶发残影/花屏（调试中排除的假因） | get_wch 隐式 wrefresh 推过期缓冲 | 全 stdscr 单缓冲 | 不适用；ink 单缓冲树渲染 |

## B 层：交互语义（需在 Node 版重新实现等价防护）

| ID | 症状 | 栟因 | Python 修法 | Node 验证点 |
|----|------|------|------------|-------------|
| B1 | 编辑状态不保存无法退出；现值不带出 | getstr 无法预填 + Esc 被吃成输入字符 | get_wch 逐字符 `_config_input`（预填/退格/Esc=None） | Node 行内编辑必须支持 initial value + Esc 取消返回 null；验证：编辑预填现值、Esc 不落盘 |
| B2 | 改名提示输入超时返回空串 | timeout(500) 在 getstr 期间未关 | `_prompt` 进出关/恢复 timeout | Node 无 curses timeout；验证：改名输入等 10s 再回车仍完整 |
| B5 | 改名/恢复提示与帮助行叠字 | 提示画在 H-2（帮助行位置） | 提示统一画状态行 H-1-nh + 整行垫空 | 布局需专设状态行；验证：改名时帮助行完好无叠字（pty 行级断言） |
| B3 | 同一快捷键说明拆成两行 | 帮助行字符级折行 | 按 `\|` 段贪心折行 `_hard_wrap` | 复刻段折行；验证：窄终端帮助行无 ≤3 字符残段 |
| B4 | Cmd+R 诉求不可实现 | 终端截留 Cmd 系按键 | F5/Ctrl+L 替代 | 键位只用终端可透传键；验证：键位表无 Cmd 系 |
| B7 | 配置面板弹层 UI 被否（太挫） | 弹层式选择 | 两页式：列表页→整页详情页 | Node 版直接两页式；验证：无任何弹层组件 |
| B8 | 颜色选择页崩溃 | `_color_options` 三元组与 picker 二元组约定相反 | 统一元组约定 + idx 定位不假设元数 | TS 用显式 interface `{label,attr,value}`；验证：tsc strict 编译期杜绝 |
| B9 | 带病提交（46/47 仍 push） | 管道 `\| tail` 吞测试退出码 | `&&` 链不放测试于管道后 | CI 脚本禁管道吞码；验证：测试失败时发布脚本必须非零退出 |
| B10 | 补丁幻觉碎片（旧草稿混入新码） | 长块代码发射退化 | 锚点计数断言 + tmp+os.replace + ast.parse | TS 编译器天然校验；review 时 grep 历史坏名 |
| B6 | 恢复行为错：e 键从不开终端 claude | direct 分支 execvp 了 cmux argv | build_direct_argv | Node resume 必须直跑 resume_cmd；验证：Enter 后 $=claude 进程在原目录 |
| B11 | `o` 阅读时 j/k 切换会话而非滚内容 | 无阅读独占态 | pager_open 独占按键块 | Node 阅读态独占按键；验证：阅读态 j/k 不改列表选中 |
| B12 | Tab 项目过滤弹层误伤按键 | 弹层独占块缺失 | picker 独占块 | 各模态（搜索/阅读/编辑）按键互不泄漏；验证：逐模态按键矩阵测试 |

## C 层：解析/语义（移植最易复发）

| ID | 症状 | 根因 | Python 修法 | Node 验证点 |
|----|------|------|------------|-------------|
| C1 | 多行首问标题泄漏到边框外 | title 含 `\n`，addstr 遇 \n 折行 | `re.sub(r"\s+"," ")` 净化 | parse.ts 已对拍复刻；验证：multiline fixture 对拍含净化后 title |
| C2 | 搜索输入"为什么"变乱码 | getstr 字节级读 CJK | get_wch 整字读取 | Node readline 处理 UTF-8 codepoint；验证：搜索框输入中文过滤正确 |
| C3 | 宽字符列宽误判 | east_asian_width A 类（★·—é/西里尔）宽度歧义 | A 类计 2 列（宁宽勿窄） | width.ts 对拍 A 类样本；验证：★/é/Cyrillic 混排行不裂 |
| C4 | 自定义 `cc --resume {sid}` 报错 | /usr/bin/cc(clang) 遮蔽 shell 函数；which 探测不可靠 | 一律 `$SHELL -ic` 执行 resume_cmd | Node 复刻：resume 一律 spawn $SHELL -ic；验证：shell 函数名命令成功执行 |
| C4b | cc 命令报 clang 错 | 同上（which 命中系统 clang） | 同上 | 同上；验证：`build_resume_argv` 不含 which 分支 |
| C5 | 改名后新名字不显示 | mtime 恢复原值后旧缓存键仍命中 | rename 内按 path 驱逐缓存条目 | Node 无缓存（M1 决策直扫）；验证：grep 无 cache.json 读写 |
| C5b | v13 旧缓存毒化新解析语义 | 缓存键不含解析语义版本 | CACHE_VERSION 递增 | 无缓存则无此问题；验证：同上 |
| C6 | /tmp 下启动列 0 条 | macOS /tmp→/private/tmp 符号链接 | realpath 两侧归一 | parse.ts 已对拍；验证：realpath 用例在对拍组 |
| C6b | 从哪打开恢复到哪丢失 | 启动目录被折叠/归组 | 编码目录名反解 + hint 消歧 | 已对拍 6 用例；验证：launchdir_cases.json 全绿 |
| C7 | 测试文件被截空 | `open('w').write(expr)` expr 抛错先截断 | 计算→tmp→os.replace | Node 写盘统一 writeTmp+rename；验证：grep 无非原子写 |
| C8 | 改名后会话跳到列表顶 | append 改 mtime | os.utime 恢复原 mtime_ns | Node 版等价防护；验证：rename 后列表顺序不变 |
| C9 | 最后回复截断成半句 | last_reply 预算 500 | 放宽 4000 | 已对拍 longreply fixture；验证：4000 截断字节一致 |
| C10 | AI 总结 markdown 裸奔难读 | 无渲染 | _md_lines（表格对齐/标题/列表/围栏/粗体） | width.ts 移植项；验证：md 对拍组全绿 |
| C13 | 启动列出不当前目录会话 | 缓存/归组污染默认视图 | 默认=当前目录，无则空，Esc 展开 | scanProjects 默认过滤；验证：空目录启动列表空 |

## D 层：流程/发布（不属代码，但复发代价高）

| ID | 症状 | 根因 | 处置 | Node 流程验证点 |
|----|------|------|------|----------------|
| D1 | 贡献者出现 Claude | Co-Authored-By trailer | 历史 filter 重写 | commit 模板禁 trailer；验证：`git log --format=%B` 无 Claude 字样 |
| D2 | superpowers 文档入库 | 初始提交带入 docs/superpowers | filter-branch 清史 + .gitignore | 验证：`git ls-files \| grep -i super` 空 |
| D3 | 帮助行动态换行"没生效"误报 | 用户运行旧实例 | 重启提示 | 验证：README 安装节注明重启生效 |

---

## 统计

- **共 33 条**：A 层 6（免疫） / B 层 12（需防护） / C 层 13（易复发） / D 层 2（流程）
- Node 版当前覆盖：C1/C5/C5b/C6/C6b/C9 已由 M1 对拍锁定；A 层 ink 架构性免疫但需目验
- **最危险 3 条**：
  1. **B1 行内编辑**（两轮翻车的坑：预填+Esc；Node readline 初值与 Esc 语义必须首日验证）
  2. **C4 resume_cmd shell 语义**（which 遮蔽是真实用户报障；Node 版若走 which 分支必复发）
  3. **B9 测试退出码**（带病提交已发生 1 次；发布链路必须显式 `set -e` 或退出码直通）

## Node 版待验证清单（后续 agent 直接执行）

1. B1/B2/B5：改名/编辑流 pty 断言（预填、Esc、不叠字）
2. B3/C3/C10：width.ts 对拍组（段折行/宽度/md 渲染）
3. C4：resume_cmd 走 $SHELL -ic（造 shell 函数验证函数体执行）
4. B4：键位表审计（无 Cmd 系）
5. B11/B12：模态按键矩阵（阅读/搜索/编辑互不泄漏）
6. A4：空闲 5s 零输出
7. A3：配置面板反复进出帧一致
8. C8：rename 后顺序不变
9. D1/D2：仓库卫生检查
10. B9：测试/发布脚本退出码直通

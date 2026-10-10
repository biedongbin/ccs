# md-video 可复用 skill + ccs 介绍视频 — 设计

日期：2026-10-10
状态：已批准

## 目标

1. 把 answer-me-with-html 的「Markdown → 3b1b 风格解释视频」能力落地为一个可复用的本地 skill。
2. 用该能力为本项目 ccs 制作一条介绍使用视频，产品入库。

## 背景

- 能力来源：QingYunA/answer-me-with-html（MIT）。核心是 `scripts/am.mjs`——单文件打包 CLI，零依赖，Node 20+。
- `am video`：稿件 = 页面稿格式 + `>` 旁白行（每行一拍）；输出单文件播放器 HTML（音频内嵌、离线可播）；`--mp4` 额外产 1080p MP4（headless Chrome 逐帧截图 + ffmpeg 编码）。
- 本机条件已核验：Node v22.22.1、ffmpeg 8.1、macOS say 有 zh_CN 语音（Eddy/Flo 等）、Chrome 存在 → `--mp4` 与系统配音均可用。
- 本机已装 answer-me-with-html 插件 v0.4.14（页面功能日常走它）；/tmp/amwh 仓库快照为 v0.5.0，更高。

## A. 可复用 skill：`~/.claude/skills/md-video/`

- 源：`/tmp/amwh/skills/answer-me-with-html/`（v0.5.0）整包拷贝（SKILL.md + references/ + scripts/am.mjs，共 576K）。
- 唯一改动：frontmatter——`name: md-video`；description 收窄为「把 Markdown 稿转成 3b1b 风格解释视频（am video）或一页解释 HTML（am render），适合演示视频、讲解视频、功能介绍」。
- 定位：已装的 answer-me-with-html 插件照常服务日常问答出页面；md-video 专门负责「用户点名要视频」的场景，并顺带承担更新版 am。
- 不改 am.mjs、不改 references。

## B. ccs 介绍视频

- 稿件：`docs/video/ccs.zh.md`。4–6 场景，`theme: 3b1b`，中文旁白（系统 say 的 zh_CN 声音朗读）。
- 叙事线：旧痛点（--resume 只列当前目录、跨目录找会话像考古）→ ccs 是什么（单文件 TUI、零依赖）→ 双栏浏览（左列表右详情）→ 恢复原理（从编码项目路径还原启动目录）→ 安装一行。
- 旁白写口语：每行一拍 1–2 句，`[节点名]` 控制镜头聚焦；场景内组件行序 = 讲解步序。
- 生成：`node ~/.claude/skills/md-video/scripts/am.mjs video docs/video/ccs.zh.md --mp4`（配音 `--voice auto` → 系统 say）。
- 产物入库 `docs/video/`：播放器 HTML + 1080p MP4（约 1–3MB）。
- `README.md` 与 `README.zh-CN.md` 各加「演示视频」小节链接 MP4。

## 验收

1. `am video` 一次通过，无 ParseError/ STE 阻断。
2. `docs/video/` 下列表页 HTML + MP4，时长 60–90 秒。
3. MP4 含中文配音；播放页章节条可跳场景。
4. 设计文档 + 稿件 + README 改动提交 git。

## 边界（不做）

- 不 fork 官方仓库、不追官方更新（skill 是静态快照）。
- 不做 ElevenLabs / 本地 TTS 配置（voice=auto 即可）。
- 不自动建 always-on 高频模式。
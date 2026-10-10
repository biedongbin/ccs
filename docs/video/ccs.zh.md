---
title: ccs — 跨目录找回 Claude Code 会话
subtitle: 看懂 · 装上 · 会用 · 能配
theme: 3b1b
---

> 换个仓库，上周的会话就找不到了。

## 背景与设计

```flow LR
--resume -> 只见当前目录: 换仓库就找不到
ccs -> 扫描全库: 所有项目
扫描全库 -> 回车恢复: 回到启动目录
```

> 内置 --resume 只列[当前目录]。
> ccs [扫描全库]，跨目录一张列表。
> [回车恢复]，回到当初的启动目录。

## 主界面

![ccs 主从双栏，左列表右详情](docs/video/shots/tui-main.png)

- `↑↓` 选择 · `/` 搜索 · `Enter` 恢复

> 完整界面：左列表，右详情。
> 快捷键：↑↓ 选择，/ 搜索，回车恢复。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
```

> 一行 curl，装完即用。
> 纯标准库，零依赖，macOS、Linux、Windows 都能跑。

## 搜回上周的会话

![按 / 输入视频，列表实时过滤](docs/video/shots/tui-search.png)

`Enter` 回车 → 恢复到当初的目录

> 按 / 搜「视频」，立刻浮出来。
> 回车，回到当初的目录，上下文全在。

## 配置：语言与主题

![ccs --config：语言、主题、恢复命令、自定义调色板](docs/video/shots/tui-config.png)

- `lang` 界面语言 · 10 种
- `theme` 配色主题 · 4+ 种 · 支持自定义调色板

> 首次启动引导选择语言和主题。
> ccs --config 随时再改，配置存 ~/.ccs/config.json。
> 跨目录找回会话——ccs 一下。
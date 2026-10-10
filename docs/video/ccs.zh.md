---
title: ccs — 跨目录找回 Claude Code 会话
subtitle: 看懂 · 装上 · 会用 · 能配
theme: 3b1b
---

## 背景与设计

```flow LR
--resume -> 只见当前目录: 换仓库就找不到
ccs -> 扫描全库: 所有项目
扫描全库 -> 回车恢复: 回到启动目录
```

> --resume 只列当前目录；ccs [扫描全库]，回车恢复到原目录。

## 主界面

![完整界面：主从双栏，底部一排快捷键](docs/video/shots/tui-v2-main.png)

> 左列表，右详情，底部是快捷键栏。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
```

> 一行 curl，即装即用。

## 第一步：按 / 搜索

![按 /，底部弹出搜索框](docs/video/shots/tui-v2-slash.png)

> 按 /，搜索框出来。

## 第二步：输入关键词

![输入「视频」，列表实时过滤到一条](docs/video/shots/tui-v2-done.png)

> 输入「视频」，列表实时过滤。

## 第三步：回车恢复

![选中会话回车，恢复到当初的目录](docs/video/shots/tui-v2-done.png)

> 回车，恢复到当初的目录，上下文全在。

## 配置：语言与主题

![ccs --config：语言 10 种、主题 4+ 种、恢复命令、自定义调色板](docs/video/shots/tui-config.png)

> ccs --config 随时改：10 语言，4+ 主题。
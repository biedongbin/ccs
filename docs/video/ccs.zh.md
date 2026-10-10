---
title: ccs — 跨目录找回 Claude Code 会话
subtitle: 15s 背景 · 3s 安装 · 15s 实用
theme: 3b1b
---

> 换个仓库，上周的会话就找不到了。

## 痛点与设计

```flow LR
(内置 --resume) --> 只列当前目录
(会话 JSONL) --> ccs 扫描全库
ccs 扫描全库 --> 回车恢复
```

> 内置 --resume 只列[当前目录]。
> ccs 扫描全库，跨目录一张[列表]。
> 回车恢复，回到当初的[启动目录]。

![ccs 主从双栏：左列表右详情，详情含标题、项目、分支、ID](docs/video/shots/tui-main.png)

> 左列表，右详情，一屏看完。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
```

> 一行 curl，零依赖。

## 实用：搜回上周的会话

![输入 /视频 后列表只剩一条会话](docs/video/shots/tui-search.png)

> 按 / 搜「视频」，立刻浮出来。
> 回车，回到当初的目录，ccs 一下。
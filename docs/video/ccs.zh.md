---
title: ccs — 跨目录找回你的 Claude Code 会话
subtitle: 单文件 TUI · 零依赖
theme: 3b1b
---

> 明明上周聊过，却怎么也找不到那个会话。

## 问题：会话散落各处

```flow LR
(项目 A) -> ~/.claude/projects/xxx
(项目 B) -> ~/.claude/projects/yyy
(项目 C) -> ~/.claude/projects/zzz
```

> Claude Code 把每个项目的会话，存进以[项目路径]编码的目录里。
> 于是内置的 --resume 只能列出[当前目录]的会话，站在仓库 A 看不到仓库 B。

## 现状：内置选择器太薄

| | 内置 --resume | ccs |
|---|---|---|
| 跨目录浏览 | no | ok |
| 干净标题 | no | ok |
| 归档管理 | no | ok |

> 内置选择器还有两个短板：[标题]多半是一大段样板，[归档]更是无从谈起。
> 项目一多，找一次会话就像考古——所以有了 ccs。

## ccs：一个主从双栏 TUI

```flow TB
ccs 启动 -> 扫描 ~/.claude/projects
扫描 ~/.claude/projects -> [主列表]: 所有会话
主列表 -> [详情栏]: 首尾指令 · 最后回复
详情栏 -> 选中回车
选中回车 -> 回到当初的启动目录
```

> ccs 把所有项目里由人打开过的会话，汇成一张[主列表]，右边是可复制的[详情栏]。
> 选中一条回车，会话恢复，并且回到它当初被启动的那个目录。

## 恢复的关键：从编码路径还原

```sequence
ccs -> 会话 JSONL: 读出项目路径
会话 JSONL -> ccs: /Users/bob/work/ repo-x
ccs -> 终端: 切换工作目录
终端 -> Claude resume: 从 repo-x 恢复
```

> 秘密很简单：目录名就是路径的编码，反过来解开就行。
> ccs 解出路径，切过去，再调用 --resume——不折叠、不归组、不猜 git 根。

## 管理与安装

```timeline
0s | 一行 curl 安装
1s | 双栏浏览 · 搜索 · 主题
2s | 归档进 ~/.ccs · 永不删除
3s | 10 语言 · 4+ 主题
```

> 安装只要一行 curl。归档只是搬进 ~/.ccs ，随时可以还原，纯标准库零依赖单文件。

> 下次再找不到会话，记得 ccs 一下。
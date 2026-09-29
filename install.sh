#!/bin/sh
# ccs 一键安装：下载单文件 ccs 到 PATH 下的 ~/.local/bin
set -e
SRC="https://raw.githubusercontent.com/biedongbin/ccs/main/ccs"
BIN="${CCS_BIN:-$HOME/.local/bin}"
mkdir -p "$BIN"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$SRC" -o "$BIN/ccs"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$BIN/ccs" "$SRC"
else
  echo "error: 需要 curl 或 wget" >&2; exit 1
fi
chmod +x "$BIN/ccs"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "note: $BIN 不在 PATH，请将下面一行加入 shell 配置（~/.zshrc 或 ~/.bashrc）:"
     echo "  export PATH=\"$BIN:\$PATH\"" ;;
esac
echo "installed: $BIN/ccs — 运行 ccs 开始"

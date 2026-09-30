<h1 align="center">ccs</h1>

<p align="center">
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/🌐_简体中文-点我阅读中文-red?style=for-the-badge" alt="简体中文"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/python-3.9+-green?style=flat-square" alt="Python 3.9+">
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-orange?style=flat-square" alt="License">
</p>

> **A single-file terminal UI for managing Claude Code sessions — across every project directory.**
> Browse, search, archive, and resume any session back into the directory it was launched from.
> Pure Python 3 stdlib, zero dependencies, one file.

---

## The 10-second pitch

Claude Code's built-in `--resume` picker only lists sessions of the **current** directory, hides almost all metadata, and can't archive anything. As your projects pile up, finding "that conversation from last week in the other repo" becomes archaeology.

**ccs** reads `~/.claude/projects/` directly and fixes that in one master-detail TUI: every human-opened session from every project in a single list, with clean titles, a copyable detail pane, and one-key resume — **into the exact directory the session was launched from**.

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
ccs
```

That's it. Pick a session, hit `Enter`, and your terminal is taken over in place — back in the session's original directory.

## What you get — at a glance

| Capability | What it means |
|---|---|
| Cross-directory browsing | Every project's sessions in one list; defaults to the current directory, `Esc` widens to all |
| Resume where it was opened | Launch directory recovered from the encoded project path — no grouping, no git-root guessing |
| Clean titles | `/clear`, `<command-name>`, continuation boilerplate and subagent sidechains never leak in; the real first question is found even beyond the 64 KB head sample |
| Detail pane | First question, last reply, project, branch, session ID — plain text, natively mouse-selectable for copy |
| Archive / restore / soft-delete | Sessions move under `~/.ccs/`, never `rm`'d |
| 10 languages, 4+ themes | UI language and colors configurable; define your own palettes |
| SDK noise filtered | `entrypoint: sdk-cli` derivative sessions (compact by-products) are hidden |

## Install

One-liner (macOS / Linux, no clone needed):

```bash
curl -fsSL https://raw.githubusercontent.com/biedongbin/ccs/main/install.sh | sh
```

Or from a clone:

```bash
git clone https://github.com/biedongbin/ccs.git && cd ccs
chmod +x ccs && ln -sf "$(pwd)/ccs" ~/.local/bin/ccs
```

### Windows

Windows Python has no curses in the standard library — install the shim first, then run via `python`:

```powershell
pip install windows-curses
curl.exe -fsSL -o ccs https://raw.githubusercontent.com/biedongbin/ccs/main/ccs
python ccs          # or: Set-Alias ccs "python <path>\ccs"
```

Windows specifics:

- **Terminal**: use Windows Terminal. The legacy console (conhost) mangles CJK width and breaks the two-pane layout.
- **Clipboard**: `y` / `Y` use `clip.exe` (pbcopy is macOS-only); with neither present, ccs says so and continues.
- **Stability note**: core logic (parsing, cache, archive) is plain Python and covered by tests, but the curses rendering path is developed and verified on macOS/Linux; treat Windows as best-effort.

## Usage

```bash
ccs            # TUI (shows only the current directory's sessions; empty if none — Esc shows all)
ccs -a         # start in the archive view
ccs -r         # ignore cache, full rescan
ccs --config   # config panel: shows current values, j/k to inspect details, Enter to edit
ccs --check    # non-interactive: session/project/archive counts + latest titles
```

First launch with no `~/.ccs/config.json` runs a guided setup for language and theme.

| Key | Action |
|---|---|
| ↑/↓ or j/k | move |
| `/` | search (title / project / session ID, case-insensitive) |
| Tab | project filter picker (Enter confirm, Esc cancel) |
| Enter | resume in place: chdir to the session's original directory and exec (template configurable via `resume_cmd`) |
| a / u | archive / restore |
| A | archive view ↔ main list |
| d | soft-delete (moved to `~/.ccs/trash/`, see below) |
| J / K | scroll the detail pane |
| `o` | read the current session fullscreen (pager: j/k scroll, Space page, g/G ends, q back) — for long AI summaries |
| y / Y | copy first question / last reply to clipboard (pbcopy) |
| r / R | rename the session — equivalent to Claude Code's `/rename` (appends a `custom-title` record; the official picker shows it too) |
| s | AI summary: runs a background `claude -p` analysis of the session (goals / progress % / branch state / issues list), result stored in `~/.ccs/summaries.json` and shown at the top of the detail pane; non-blocking — switching sessions doesn't cancel it |
| F5 or Ctrl+L | rescan (Cmd-key combos never reach a terminal app, hence no Cmd+R) |
| Esc | always goes back: close picker → clear search/filter → exit archive view |
| q | quit |

## Archive & delete: nothing is ever really deleted

Both operations are atomic file moves (`shutil.move`) — ccs never runs `rm`:

| Action | File goes to | How to get it back |
|---|---|---|
| `a` archive | `~/.ccs/archive/<project>/<uuid>.jsonl` (sorted by source project) | `u` in the archive view (`A`) moves it back to the exact original project directory |
| `d` delete | `~/.ccs/trash/<uuid>.jsonl` (name collisions get `.1`, `.2` suffixes, never overwritten) | manually move the file back into `~/.claude/projects/<project>/` — it reappears in the list |

Side effect of both: the file leaves `~/.claude/projects/`, so the built-in `claude --resume` picker no longer lists it. ccs never touches Claude Code internal state — restoring the file restores it everywhere.

## Resume semantics

A session's directory is the directory Claude Code was launched in — recovered from the encoded `~/.claude/projects/` folder name, no folding, no grouping, no git-root inference:

- **Original directory exists** → resume there (the normal case).
- **Original directory is gone** → ccs prompts you to type a target directory (empty = cancel). If the typed directory doesn't exist, ccs offers to create it.
- The resume command itself is swappable (`resume_cmd`) — nothing is tied to a multiplexer; teams without cmux/Tmux work as-is.

## Configuration

`~/.ccs/config.json` — edit directly or rerun `ccs --config`.

| Option | Default | Description |
|---|---|---|
| `lang` | `zh` | UI language: `zh en ja ko es fr de ru pt it` |
| `theme` | `default` | `default` (cyan) · `ocean` (blue) · `dracula` (magenta) · `mono` (no color) |
| `resume_cmd` | `claude --resume {sid}` | Resume command: fill in just the base command (e.g. `cc`) — `--resume {sid}` is appended automatically; full templates containing `{sid}` also work. Executed via your interactive shell (functions/aliases apply). Example: `"claude --dangerously-skip-permissions"` |
| `custom` | — | user-defined palettes, see below |

### Custom themes

`ccs --config` → custom palettes → create: type a name, pick an accent color and a message color (8 options each, with color-block previews) — saved and enabled in one go. Accent drives borders / time column / selection rows; msg drives the bottom message line. Existing themes can be used or deleted with one key.

Power users can also hand-edit `~/.ccs/config.json`: `{"custom": {"nord": ["cyan", 114]}}` — the second slot accepts integers `0–255` on 256-color terminals.

## Notes

- **Data layout** — reads `~/.claude/projects/` read-only; never touches Claude Code internal state. ccs's own data lives in `~/.ccs/` (`cache.json` index keyed by path + mtime, `archive/`, `trash/`).
- **Theme rendering** — colors are static curses pairs; the background follows your terminal. Dark terminals: `dracula` / `default`. Light terminals: `ocean` / `mono`.
- **Schema drift** — title fallback chain (sidecar summary → in-file summary → first real user message → filename) absorbs jsonl schema changes; parsing never raises.
- **Testing seam** — env vars `CCS_PROJECTS_DIR` / `CCS_HOME` redirect both roots.

## FAQ

**Why does the list show fewer sessions than files on disk?** Two filters: subagent/sidecar files are folded into their parent session, and `sdk-cli` derivative sessions (compact by-products never opened by a human) are hidden.

**`ccs: command not found` after install.** `~/.local/bin` isn't on your `PATH` — add `export PATH="$HOME/.local/bin:$PATH"` to your `~/.zshrc` / `~/.bashrc`.

**The original directory of a session is gone.** ccs asks you where to resume (empty input cancels), and offers to create the directory if it doesn't exist. It never silently falls back to the current directory.

**Can I copy text from the detail pane with the mouse?** Yes — ccs deliberately does not capture mouse events; the terminal's native selection works.

## Tests

```bash
python3 test_ccs.py    # assert-style, no framework, 46 checks
```

## License

[MIT](LICENSE)

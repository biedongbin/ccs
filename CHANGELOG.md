# Changelog

## 1.1.0 (2026-10-08)

### Node native build (new distribution channel)

- npm package `claude-code-sessions` now ships a **native Node (ink) TUI**, feature-equal to the Python one and sharing `~/.ccs/` data: `bin.ccs` = Node build, `bin.ccs-py` = Python twin (needs python3).
- Core layers are a verified port: parse / width / archive / config / resume / summary — locked by a byte-level parity harness (61 groups) against the Python implementation, plus 49 unit tests, 4 pack tests, and a 12-scenario pty e2e suite.
- i18n is exported from the Python source (`_LANG_DATA`, 10 languages × 38 keys) — zero hand translation, zero drift.
- Node specifics: rescan is `Ctrl+L` (ink doesn't forward F5); everything else matches the key table.

### Python TUI

- **Two-page config panel** (`ccs --config`): list page shows items / current values / descriptions (wrapped), Enter opens a full-page detail view per item; no popups anywhere.
- **Custom palettes, visually**: create a theme by typing a name and picking accent + message colors from live color blocks; use/delete existing themes with one key. No hand-written JSON required.
- **`resume_cmd` base-command semantics**: fill in just `cc` — `--resume {sid}` is appended automatically; full templates containing `{sid}` still work. Executed via your interactive shell (`$SHELL -ic`), so shell functions/aliases (e.g. a `cc()` wrapper) behave exactly like in your terminal.
- **`r` / `R` unified to rename** (empty input = full replacement, matching `/rename` semantics); rescan moved to **F5 / Ctrl+L** (Cmd-key combos never reach a terminal app).
- **Rename preserves mtime** — renaming no longer jumps the session to the top of the list.
- **`o` fullscreen reader** with lightweight markdown rendering (aligned tables, headers, list bullets; fences and `**` stripped) for long AI summaries; help line wraps by `|`-segment so a single key's description is never split.
- Idle redraws eliminated (no flicker); prompts moved to a dedicated status line.

### Fixes (from a 5-round independent review loop — 26 findings, trend 17→3→2→3→1→0)

- Critical: npm global bin (a symlink) was silent — entry detection now goes through `realpath`.
- Default directory filter anchors to the launch dir on startup (empty list if none; Esc widens to all).
- Detail pane truncates overlong sid/cwd to column width (no spillover).
- `summaries.json` atomic writes use pid-suffixed temp files (safe with two instances running).
- Summary jobs close their fd after spawn (was one fd leaked per `s`).
- Empty-input rename no longer concatenates onto the old title.
- Enter on a session without sid shows a message instead of crashing; a broken `$SHELL` exits non-zero.

### Docs & meta

- README (en/zh): three install channels (npx / npm -g / curl), Node-vs-Python key caveats, test counts updated.
- Review trail published: `ts/REVIEW.md`, `ts/REVIEW_R1..R5.md`, `ts/HISTORY_AUDIT.md`, `ts/HISTORY_VERIFY.md` (33 historical Python issues re-verified against the Node build).

## 1.0.0 (2026-09-30)

Initial public release.

- Single-file Python 3 TUI (stdlib only, zero dependencies): browse / incremental-search / archive / soft-delete / resume Claude Code sessions across every project directory.
- Session list defaults to the current directory; one-key resume returns the session to its original launch directory (terminal takeover via exec).
- Title chain aligned with the official picker: `custom-title` > `ai-title` > summary > first real user message > filename.
- Detail pane: first question / last reply / project / branch / session id; mouse-selectable plain text.
- Archive / restore / trash — files only ever move under `~/.ccs/`, never `rm`'d.
- AI summaries: background `claude -p` analysis per session, results shared via `~/.ccs/summaries.json`.
- 10 languages, 4 built-in themes + custom palettes; guided first-run setup.
- MIT licensed; 47-assert test suite.

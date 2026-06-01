# claude-catalog

A Claude Code plugin that opens a local web UI for browsing every skill, MCP tool, plugin, and slash command installed in your environment — with automatic usage tracking.

Type `/catalog` in Claude Code. A browser tab opens at `http://127.0.0.1:47823` with a searchable, filterable view of everything you have installed: what it does, where it lives on disk, how often you actually use it, and when you last reached for it.

## Why

Once you've installed a few dozen skills, plugins, and MCP servers, discoverability collapses. There's no way to see what's available, what's stale, or what you should be reaching for more often. `claude-catalog` is that view.

## Install

Two commands in Claude Code:

```
/plugin marketplace add tysondoberneck/claude-catalog
/plugin install catalog@claude-catalog
```

The first adds this repo as a marketplace. The second installs the `catalog` plugin from it — only the `/catalog` slash command. No hooks, no background daemon, nothing fires on your normal Claude turns.

## What you get

- **One pane for everything installed** — skills, slash commands, MCP servers, and plugins, with their description, source path, and how often you actually use them.
- **Usage tracking** — per-item counts, last-used time, and a 60-day sparkline derived from your real history.
- **Filter pills** — type (skill / command / mcp / plugin), `stale` (anything outside the activity window), and a `built-ins` toggle for Claude Code's built-in commands and built-in MCPs (off by default).
- **Configurable activity window** — 7 / 14 / 30 / 90 / 180 days or all-time. Items outside the window are considered stale.
- **Tree view** — group plugin children under their parent plugin with expand-all / collapse-all. Flat list is also available.
- **MCP per-tool breakdown** — each MCP server detail pane lists the tools you've actually called, with counts and last-used.
- **External orphans** — items that appear in your usage history but whose source isn't in the current scan (e.g. used from another project, uninstalled plugins) are surfaced as `EXTERNAL` so they don't disappear silently.
- **Disabled plugins** — plugins sitting in the cache without an `.in_use` marker show with a `DISABLED` badge.
- **Source preview** — the detail pane renders the SKILL.md / command.md markdown by default, with VS Code / Cursor / Reveal-in-Finder links.
- **Keyboard navigation** — `j` / `k` / arrows to move, `g` / `G` to jump, `/` to focus search, `Esc` to clear.
- **URL deep linking** — filter state lives in the query string, selected item in the hash, so links restore the same view.
- **Light / dark mode** — auto-detects system preference; toggle persists.

## Where the data comes from

The catalog is **read-only**. It computes everything from files Claude Code already maintains on its own — no hooks, no per-turn instrumentation, no separate event log.

- **Slash command usage** — `~/.claude/history.jsonl` (every prompt you've submitted, with timestamp).
- **Skill activations** (explicit `/skill-name` invocations *and* auto-triggered via description) — `~/.claude.json` `skillUsage`, the canonical per-skill aggregate Claude Code maintains; cross-checked against `attributionSkill` in session transcripts to power the day-by-day sparkline.
- **MCP tool calls** — `~/.claude/projects/<project>/<session>.jsonl` transcripts, scanning `tool_use` blocks named `mcp__<server>__<tool>`.
- **Installed inventory** — `~/.claude/plugins/cache/`, `~/.claude.json`, `<cwd>/.claude/`.

Since the catalog only reads, installing it is purely additive: it doesn't modify your settings, it doesn't change your Claude turn latency, and uninstalling it leaves no residue (other than what you choose to keep in `~/.claude/catalog/`).

## What runs on your machine

- A small Node HTTP server (`node:http`, zero native deps) on port `47823` (override with `CATALOG_PORT`). Bound to `127.0.0.1` only. Idle-shuts down after 30 min.
- A single-page UI loaded from disk, using Preact + Tailwind via CDN.

That's it. No hooks. No daemon. No telemetry. No build step.

## Privacy & footprint

Everything stays on your machine. Because the catalog is read-only, the on-disk footprint is small.

**Written by the catalog**
- `~/.claude/catalog/server.log` — server stdout/stderr.
- `~/.claude/catalog/port` — the port the server is listening on.

That's all. The catalog never modifies `~/.claude/settings.json`, never writes events, and never touches your prompt history or session transcripts.

**Read by the catalog**
- `~/.claude.json` — installed-plugin status, project-scoped MCP servers, and Claude Code's own `skillUsage` counts.
- `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — to enumerate installed skills, commands, MCP servers.
- `~/.claude/history.jsonl` — your prompts. We extract `display` (the leading slash command, if any) and `timestamp`. Prompt bodies are not stored or transmitted.
- `~/.claude/projects/<project>/<session>.jsonl` — assistant transcripts. We extract `tool_use` block names, `attributionSkill`, and timestamps. Same: no body retention.
- `<cwd>/.claude/` and `<cwd>/.mcp.json` — project-scoped skills, commands, MCP servers.

Aggregates from these reads are cached in memory for 5 minutes and then discarded — nothing is persisted.

**Network**
- Server binds `127.0.0.1` only — never reachable from other machines.
- No outbound HTTP calls, no analytics, no phone-home.
- Localhost has no auth: anything running as your user can `curl http://127.0.0.1:47823/api/items`. Fine for personal machines; consider this if you run untrusted local code.

**Process lifecycle**
- HTTP server auto-shuts down after 30 minutes idle. The browser tab polling `/api/items` every 10s counts as activity — close the tab and the server exits within ~30 min.
- No daemon, LaunchAgent, scheduled task, or hooks. Nothing fires on your normal Claude turns.

**Uninstall**
```
/plugin uninstall catalog
rm -rf ~/.claude/catalog   # optional, removes the server log
```

## Requirements

- Claude Code
- Node 18 or newer (already required by Claude Code itself)

## License

MIT. See `LICENSE`.

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

The first adds this repo as a marketplace. The second installs the `catalog` plugin from it. The plugin registers the `/catalog` slash command and three lightweight hooks that record usage in the background.

## What gets tracked

Each event is one append-only JSON line at `~/.claude/catalog/events.jsonl`:

- **Slash commands** — captured from `UserPromptSubmit` (prompts starting with `/`).
- **Skill invocations** — captured from `PreToolUse` on the `Skill` tool.
- **MCP tools** — captured per `mcp__<server>__<tool>` invocation, not just per-server.
- **Plugin tools** — captured per tool emitted by an installed plugin.

Tracking is fully toggleable per type and per item from the settings panel. No prompt bodies are stored by default.

## What runs on your machine

- A small Node HTTP server (`node:http`, zero native deps) on port `47823` (auto-fallback if taken). Bound to `127.0.0.1` only. Idle-shuts down after 30 min.
- Three Node hook scripts that append one JSONL line per event. They never block your Claude turn — if the file is locked, the event is dropped silently.
- A single-page UI loaded from disk, using Preact + Tailwind via CDN.

No external services. No telemetry. No build step.

## Privacy & footprint

Everything stays on your machine. Here's exactly what touches disk and what gets read.

**Written by the catalog**
- `~/.claude/catalog/events.jsonl` — one JSON line per tracked event: timestamp, item id (e.g. `skill:dagster-cloud`, `mcp:slack:slack_send_message`), session id, cwd, success/error. Prompt bodies are never written here. Append-only, never rotated — expect a few MB/month for typical use, tens of MB/year for heavy use. Safe to `rm` at any time; the catalog rebuilds totals from history on next launch.
- `~/.claude/catalog/server.log` — server stdout/stderr.
- `~/.claude/catalog/port` — the chosen port if the default `47823` is taken.
- `~/.claude/settings.json` — gains three hook entries on install. Removed by `/plugin uninstall catalog`.

**Read by the catalog**
- `~/.claude.json` — for installed-plugin status, project-scoped MCP servers, and Claude Code's own `skillUsage` counts.
- `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — to enumerate installed skills, commands, MCP servers.
- `~/.claude/history.jsonl` — every prompt you've ever submitted. Read to backfill slash-command counts. We extract `display` (slash command name) and `timestamp`; we don't store the prompt bodies anywhere.
- `~/.claude/projects/<project>/<session>.jsonl` — full assistant transcripts. Read to backfill skill and MCP tool usage. We extract `tool_use` block names, `attributionSkill`, and timestamps. Again: no prompt-body retention on our side.
- `<cwd>/.claude/` and `<cwd>/.mcp.json` — for project-scoped skills, commands, MCP servers.

**Network**
- Server binds `127.0.0.1` only — never reachable from other machines.
- No outbound HTTP calls, no analytics, no phone-home.
- Localhost has no auth: anything running as your user can `curl http://127.0.0.1:47823/api/items`. Fine for personal machines; consider this if you run untrusted local code.

**Process lifecycle**
- The HTTP server auto-shuts down after 30 minutes idle. The browser tab polling `/api/items` every 10s counts as activity — close the tab and the server exits within ~30 min.
- Hook scripts spawn on every Claude turn, append one line, and exit. They always exit 0 and swallow errors silently so a buggy hook can never block your turn (the flip side: if tracking silently breaks, you won't be alerted).
- Nothing persists across reboots — no daemon, LaunchAgent, or scheduled task.

**Uninstall**
```
/plugin uninstall catalog
rm -rf ~/.claude/catalog   # optional, removes events log + server log
```

## Requirements

- Claude Code
- Node 18 or newer (already required by Claude Code itself)

## Status

Early scaffolding. Roadmap:

- [x] Plugin manifest, slash command, hook wiring
- [x] HTTP server + JSONL storage
- [x] UI shell with list + detail pane
- [ ] Real filesystem scanner for skills/commands/plugins/MCP
- [ ] Per-type and per-item tracking toggles
- [ ] Usage sparklines + sort by recently-used / most-used
- [ ] MCP `tools/list` enumeration with caching

## License

MIT. See `LICENSE`.

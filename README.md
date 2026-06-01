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

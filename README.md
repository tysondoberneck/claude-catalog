# claude-catalog

A Claude Code plugin that opens a local web UI for browsing every skill, MCP tool, plugin, and slash command installed in your environment — with automatic usage tracking.

Type `/catalog` in Claude Code. A browser tab opens at `http://127.0.0.1:47823` with a searchable, filterable view of everything you have installed: what it does, where it lives on disk, how often you actually use it, and when you last reached for it.

## Why

Once you've installed a few dozen skills, plugins, and MCP servers, discoverability collapses. There's no way to see what's available, what's stale, or what you should be reaching for more often. `claude-catalog` is that view.

## Install

```
/plugin marketplace add tysondoberneck/claude-catalog
/plugin install catalog@claude-catalog
```

No hooks, no daemon, nothing fires on your normal Claude turns.

## Privacy

Everything stays on your machine. The catalog is **read-only** — it computes everything from files Claude Code already maintains (`~/.claude.json`, `~/.claude/history.jsonl`, session transcripts, the plugin cache). It never modifies your settings, never writes events, and never makes outbound network calls. The HTTP server binds `127.0.0.1` only and idle-shuts down after 30 minutes.

## Uninstall

```
/plugin uninstall catalog
rm -rf ~/.claude/catalog   # optional, removes the server log
```

## Requirements

- Claude Code
- Node 18 or newer (already required by Claude Code itself)

## License

MIT. See `LICENSE`.

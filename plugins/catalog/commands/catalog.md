---
description: Open the local catalog UI to browse installed skills, MCP tools, plugins, and slash commands.
allowed-tools: Bash
---

You are handling the `/catalog` slash command from the `claude-catalog` plugin.

Run the launcher script. It will:
1. Check whether the catalog server is already running on the configured port.
2. Start it in the background if not.
3. Open the user's browser to the UI.
4. Print the URL.

Use the absolute path to the script (resolved from the plugin's own directory) so it works regardless of the user's current working directory.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-running.mjs"
```

After running, briefly tell the user the URL the UI opened at (read it from the script's stdout). Do not do anything else.

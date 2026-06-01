// Filesystem scanner. STUB: returns a small hardcoded inventory so the rest
// of the system (server + UI) can be exercised end-to-end before the real
// walkers are written.
//
// Real implementation will scan:
//   - ~/.claude/skills/*/SKILL.md
//   - ~/.claude/commands/*.md
//   - ~/.claude/plugins/*/plugin.json (+ nested skills/commands/hooks)
//   - <cwd>/.claude/skills, <cwd>/.claude/commands, <cwd>/.mcp.json
//   - ~/.claude.json mcpServers section + cached tools/list per server

export async function scanInventory({ cwd = process.cwd() } = {}) {
  return [
    {
      id: 'command:plugin:catalog:catalog',
      type: 'command',
      scope: 'plugin:catalog',
      name: 'catalog',
      title: '/catalog',
      description: 'Open the local catalog UI to browse installed skills, MCP tools, plugins, and slash commands.',
      source_path: '<plugin>/commands/catalog.md',
      date_added: new Date().toISOString(),
      tags: ['dev-tools'],
    },
    {
      id: 'plugin:catalog',
      type: 'plugin',
      scope: 'user',
      name: 'catalog',
      title: 'catalog',
      description: 'Browse and search every skill, MCP tool, plugin, and slash command installed in your Claude Code environment.',
      source_path: '<plugin>/plugin.json',
      date_added: new Date().toISOString(),
      tags: ['dev-tools'],
    },
    {
      id: 'placeholder:project',
      type: 'skill',
      scope: 'project',
      name: 'example-project-skill',
      title: 'Example project-scoped skill',
      description: `Stub item to demonstrate project scope. Active project: ${cwd}.`,
      source_path: `${cwd}/.claude/skills/example/SKILL.md`,
      date_added: new Date().toISOString(),
      tags: [],
    },
  ];
}

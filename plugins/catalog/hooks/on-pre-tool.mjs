#!/usr/bin/env node
// PreToolUse hook. Captures:
//   - MCP tool calls: tool_name matches mcp__<server>__<tool>  → item_id "mcp:<server>:<tool>"
//   - Skill invocations: tool_name === "Skill"                  → item_id "skill:<name>"
// Other tool calls (Bash, Read, Edit, etc.) are ignored — those aren't catalog items.

import { readStdinJSON, record } from './_lib.mjs';

const payload = readStdinJSON();
const tool_name = payload.tool_name ?? '';
const tool_input = payload.tool_input ?? {};
const session_id = payload.session_id;
const cwd = payload.cwd;

function itemId() {
  const mcp = tool_name.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  if (mcp) return `mcp:${mcp[1]}:${mcp[2]}`;
  if (tool_name === 'Skill') {
    const name = tool_input.skill;
    if (name) return `skill:${name}`;
  }
  return null;
}

const id = itemId();
if (id) {
  record({
    item_id: id,
    kind: 'invoke',
    session_id,
    cwd,
    meta: { tool_name },
  });
}

process.exit(0);

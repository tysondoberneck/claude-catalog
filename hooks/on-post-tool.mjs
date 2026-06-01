#!/usr/bin/env node
// PostToolUse hook. Captures success/error outcomes for MCP tools and Skills,
// so the UI can show reliability stats per item.

import { readStdinJSON, record } from './_lib.mjs';

const payload = readStdinJSON();
const tool_name = payload.tool_name ?? '';
const tool_input = payload.tool_input ?? {};
const tool_response = payload.tool_response ?? {};
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
  const isError = Boolean(tool_response?.is_error || tool_response?.error);
  record({
    item_id: id,
    kind: isError ? 'error' : 'success',
    session_id,
    cwd,
    meta: { tool_name },
  });
}

process.exit(0);

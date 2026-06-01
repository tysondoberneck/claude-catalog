#!/usr/bin/env node
// UserPromptSubmit hook. Captures slash-command invocations.
// Input shape (Claude Code): { session_id, cwd, prompt, ... }

import { readStdinJSON, record } from './_lib.mjs';

const payload = readStdinJSON();
const prompt = (payload.prompt ?? '').trim();
const session_id = payload.session_id;
const cwd = payload.cwd;

// Detect a slash command at the start of the prompt: "/name" optionally followed by args.
const match = prompt.match(/^\/([\w:-]+)/);
if (match) {
  const name = match[1];
  record({
    item_id: `command:${name}`,
    kind: 'invoke',
    session_id,
    cwd,
    meta: { source: 'UserPromptSubmit' },
  });
}

// Always exit 0 — hooks must not block the turn.
process.exit(0);

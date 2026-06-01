// Shared helpers for hook scripts. Intentionally tiny and dependency-free.
// Hooks must never block or fail a Claude turn — every code path returns
// quickly and swallows errors.

import { readFileSync } from 'node:fs';
import { appendEvent } from '../server/storage.mjs';

export function readStdinJSON() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function record(event) {
  try {
    appendEvent({
      ts: Date.now(),
      ...event,
    });
  } catch {
    // never throw out of a hook
  }
}

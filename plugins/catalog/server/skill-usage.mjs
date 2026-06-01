// Read Claude Code's own skill-usage tracking from ~/.claude.json.
//
// Claude Code maintains a `skillUsage` object keyed by skill name (with the
// same plugin:skill namespacing the catalog uses), where each entry is
// `{ usageCount, lastUsedAt }`. This is the authoritative count — it captures
// auto-triggered skills, explicit Skill tool calls, and slash-command
// activations alike, exactly once per activation, maintained by Claude itself.
//
// We use this for SKILL totals (count + last_ts) and keep the session-scraped
// daily[] array for the sparkline shape. That gives accurate aggregate counts
// from one source and per-day distribution from the other.

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { emptyDaily } from './time.mjs';

const USER_CONFIG = join(homedir(), '.claude.json');

const CACHE_TTL_MS = 30 * 1000;
let cache = null;
let cacheTime = 0;

export async function aggregateFromSkillUsage() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) return cache;

  const map = new Map();
  try {
    const raw = await readFile(USER_CONFIG, 'utf8');
    const json = JSON.parse(raw);
    const su = json.skillUsage;
    if (su && typeof su === 'object') {
      for (const [name, entry] of Object.entries(su)) {
        if (!entry) continue;
        const count = Number(entry.usageCount) || 0;
        const last_ts = Number(entry.lastUsedAt) || 0;
        if (count === 0 && last_ts === 0) continue;
        map.set(`skill:${name}`, {
          count,
          last_ts,
          errors: 0,
          daily: emptyDaily(),
        });
      }
    }
  } catch {
    // ignore — missing or unreadable ~/.claude.json is fine
  }

  cache = map;
  cacheTime = now;
  return map;
}

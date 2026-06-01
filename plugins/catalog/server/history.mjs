// Backfill historical usage from sources Claude Code already writes:
//
//   ~/.claude/history.jsonl              — every prompt the user submitted,
//                                            including slash commands
//   ~/.claude/projects/<proj>/<sess>.jsonl — full assistant/user transcripts
//                                            with tool_use content blocks
//
// Both are append-only JSONL, so we can stream them. We aggregate into the
// same {count, last_ts, errors} shape that storage.aggregateByItem returns,
// then server.mjs merges with the live events.jsonl on top.
//
// Cached for 5 minutes — these files don't change fast and the scan touches
// every session transcript on disk.

import { createReadStream, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { bucketDay, emptyDaily } from './time.mjs';

const HOME = homedir();
const HISTORY_FILE = join(HOME, '.claude', 'history.jsonl');
const PROJECTS_DIR = join(HOME, '.claude', 'projects');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cacheTime = 0;

function bump(map, id, ts, isError = false) {
  const cur = map.get(id) ?? { count: 0, last_ts: 0, errors: 0, daily: emptyDaily() };
  cur.count += 1;
  if (ts > cur.last_ts) cur.last_ts = ts;
  if (isError) cur.errors += 1;
  const idx = bucketDay(ts);
  if (idx >= 0) cur.daily[idx] += 1;
  map.set(id, cur);
}

function mcpItemId(toolName) {
  const m = toolName.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  return m ? `mcp:${m[1]}:${m[2]}` : null;
}

async function streamLines(file) {
  return createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
}

async function scanHistory(map) {
  if (!existsSync(HISTORY_FILE)) return;
  for await (const line of await streamLines(HISTORY_FILE)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const display = entry.display?.trim?.();
    const ts = Number(entry.timestamp);
    if (!display || !ts) continue;
    const m = display.match(/^\/([\w:-]+)/);
    if (m) bump(map, `command:${m[1]}`, ts);
  }
}

async function scanSessionFile(file, map) {
  for await (const line of await streamLines(file)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    // Only assistant messages carry tool_use blocks.
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const tsRaw = entry.timestamp;
    const ts = tsRaw ? Date.parse(tsRaw) : 0;
    if (!ts) continue;

    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const name = block.name;
      if (!name) continue;

      const mcpId = mcpItemId(name);
      if (mcpId) {
        bump(map, mcpId, ts);
        continue;
      }
      if (name === 'Skill') {
        const skill = block.input?.skill;
        if (skill) bump(map, `skill:${skill}`, ts);
      }
    }
  }
}

async function scanAllSessions(map) {
  if (!existsSync(PROJECTS_DIR)) return;
  const projects = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  const sessionFiles = [];
  for (const proj of projects) {
    if (!proj.isDirectory()) continue;
    const projDir = join(PROJECTS_DIR, proj.name);
    const entries = await readdir(projDir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        sessionFiles.push(join(projDir, ent.name));
      }
    }
  }
  // Sequential to avoid opening hundreds of read streams at once.
  for (const file of sessionFiles) {
    await scanSessionFile(file, map).catch(() => {});
  }
}

export async function aggregateFromHistory() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) return cache;

  const map = new Map();
  await scanHistory(map).catch(() => {});
  await scanAllSessions(map).catch(() => {});

  cache = map;
  cacheTime = now;
  return map;
}

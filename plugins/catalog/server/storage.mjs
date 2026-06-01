// Append-only JSONL event store at ~/.claude/catalog/events.jsonl
// Reads stream the file once and aggregate in memory.
// Designed to never block a Claude turn: appends use a sync write with O_APPEND,
// which the OS makes atomic for short lines on POSIX.

import { appendFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

export const STATE_DIR = join(homedir(), '.claude', 'catalog');
export const EVENTS_FILE = join(STATE_DIR, 'events.jsonl');
export const SETTINGS_FILE = join(STATE_DIR, 'settings.json');

function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
}

export function appendEvent(event) {
  ensureDir(EVENTS_FILE);
  try {
    appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
  } catch {
    // Silent drop: never block a Claude turn for telemetry.
  }
}

export async function aggregateByItem() {
  const stats = new Map();
  if (!existsSync(EVENTS_FILE)) return stats;

  const rl = createInterface({
    input: createReadStream(EVENTS_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    const id = evt.item_id;
    if (!id) continue;

    const cur = stats.get(id) ?? { count: 0, last_ts: 0, errors: 0 };
    cur.count += 1;
    if (evt.ts > cur.last_ts) cur.last_ts = evt.ts;
    if (evt.kind === 'error') cur.errors += 1;
    stats.set(id, cur);
  }

  return stats;
}

#!/usr/bin/env node
// Local HTTP server for the catalog UI.
// Binds 127.0.0.1 only. Idle-shuts down after IDLE_SHUTDOWN_MS of no requests.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanInventory } from './scanner.mjs';
import { aggregateByItem } from './storage.mjs';
import { aggregateFromHistory } from './history.mjs';
import { aggregateFromSkillUsage } from './skill-usage.mjs';
import { addDaily, emptyDaily } from './time.mjs';

function mergeUsage(a, b) {
  const out = new Map();
  for (const [id, v] of a) {
    out.set(id, { count: v.count, last_ts: v.last_ts, errors: v.errors, daily: [...(v.daily ?? emptyDaily())] });
  }
  for (const [id, v] of b) {
    const cur = out.get(id) ?? { count: 0, last_ts: 0, errors: 0, daily: emptyDaily() };
    addDaily(cur.daily, v.daily);
    out.set(id, {
      count: cur.count + v.count,
      last_ts: Math.max(cur.last_ts, v.last_ts),
      errors: cur.errors + v.errors,
      daily: cur.daily,
    });
  }
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const UI_DIR = join(PLUGIN_ROOT, 'ui');

const PORT = Number(process.env.CATALOG_PORT) || 47823;
const IDLE_SHUTDOWN_MS = 30 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const safe = normalize(rel).replace(/^([/\\])+/, '');
  const filePath = join(UI_DIR, safe);

  if (!filePath.startsWith(UI_DIR)) {
    return json(res, 403, { error: 'forbidden' });
  }

  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not_found', path: urlPath });
  }
}

async function handleApiItems(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const cwd = url.searchParams.get('cwd') || process.cwd();

  const [inventory, liveUsage, historicalUsage, skillUsage] = await Promise.all([
    scanInventory({ cwd }),
    aggregateByItem(),
    aggregateFromHistory(),
    aggregateFromSkillUsage(),
  ]);
  const usage = mergeUsage(historicalUsage, liveUsage);

  // For skill ids, override count + last_ts with Claude Code's own skillUsage
  // tracking (the canonical source). Keep the session-derived daily[] for the
  // sparkline since skillUsage doesn't break down by day.
  for (const [id, su] of skillUsage) {
    const existing = usage.get(id);
    usage.set(id, {
      count: su.count,
      last_ts: Math.max(su.last_ts, existing?.last_ts ?? 0),
      errors: existing?.errors ?? 0,
      daily: existing?.daily ?? emptyDaily(),
    });
  }

  const items = inventory.map((item) => {
    let u = usage.get(item.id);
    // MCP server items: roll up per-tool events (id "mcp:<server>:<tool>") to
    // the server-level item. Events are emitted per-tool by the hooks but the
    // catalog displays one item per server with aggregate stats.
    if (item.type === 'mcp') {
      const prefix = item.id + ':';
      let count = u?.count ?? 0;
      let last_ts = u?.last_ts ?? 0;
      let errors = u?.errors ?? 0;
      const daily = [...(u?.daily ?? emptyDaily())];
      for (const [eid, e] of usage) {
        if (eid.startsWith(prefix)) {
          count += e.count;
          if (e.last_ts > last_ts) last_ts = e.last_ts;
          errors += e.errors;
          addDaily(daily, e.daily);
        }
      }
      u = { count, last_ts, errors, daily };
    }
    return {
      ...item,
      usage: u
        ? { count: u.count, last_ts: u.last_ts, errors: u.errors, daily: u.daily ?? emptyDaily() }
        : { count: 0, last_ts: 0, errors: 0, daily: emptyDaily() },
    };
  });

  // Plugin items don't get direct usage events — their skills, commands, and
  // MCP servers do. Roll up the children's totals into the plugin parent so
  // a plugin's "last used" reflects when you last used anything inside it.
  for (const item of items) {
    if (item.type !== 'plugin') continue;
    const scopeTag = `plugin:${item.name}`;
    let count = item.usage.count;
    let last_ts = item.usage.last_ts;
    let errors = item.usage.errors;
    const daily = [...item.usage.daily];
    for (const child of items) {
      if (child === item || child.scope !== scopeTag) continue;
      count += child.usage.count;
      if (child.usage.last_ts > last_ts) last_ts = child.usage.last_ts;
      errors += child.usage.errors;
      addDaily(daily, child.usage.daily);
    }
    item.usage = { count, last_ts, errors, daily };
  }

  // Surface usage data even when no inventory item backs it. This happens
  // when:
  //   - the active cwd's project skills/commands don't match the session
  //     that recorded the usage,
  //   - a plugin is in the cache without an .in_use marker so the scanner
  //     skipped it, or
  //   - the source has been uninstalled or moved.
  // Without this, real activity stays invisible.
  const seenIds = new Set(items.map((it) => it.id));
  const knownPrefixes = new Set(['skill', 'command', 'mcp', 'plugin']);
  for (const [id, u] of usage) {
    if (seenIds.has(id)) continue;
    const colon = id.indexOf(':');
    if (colon < 0) continue;
    const type = id.slice(0, colon);
    if (!knownPrefixes.has(type)) continue;
    // For MCP, skip per-tool ids that already rolled up into an existing
    // server item — they'd otherwise appear here individually.
    if (type === 'mcp' && id.split(':').length > 2) {
      const serverId = id.split(':').slice(0, 2).join(':');
      if (seenIds.has(serverId)) continue;
    }
    const name = id.slice(colon + 1);
    items.push({
      id,
      type,
      scope: 'discovered',
      name,
      title: name,
      description: 'Discovered from usage data. The source file for this item was not found in the current scan — it may belong to another project or an inactive plugin.',
      source_path: null,
      date_added: null,
      tags: ['discovered'],
      usage: { count: u.count, last_ts: u.last_ts, errors: u.errors, daily: u.daily ?? emptyDaily() },
    });
  }

  rememberCwd(cwd, items);
  json(res, 200, { items, scanned_at: Date.now(), cwd });
}

// Tiny cache so /api/items/:id/body can resolve item id -> source_path
// without rescanning the filesystem. Capped at 4 different cwds.
const lastInventoryByCwd = new Map();
function rememberCwd(cwd, items) {
  lastInventoryByCwd.set(cwd, { items, at: Date.now() });
  while (lastInventoryByCwd.size > 4) {
    const firstKey = lastInventoryByCwd.keys().next().value;
    lastInventoryByCwd.delete(firstKey);
  }
}

async function handleApiItemBody(id, res) {
  // Find the item across any cached inventory; if none, do a fresh scan.
  let item = null;
  for (const { items } of lastInventoryByCwd.values()) {
    const found = items.find((it) => it.id === id);
    if (found) { item = found; break; }
  }
  if (!item) {
    const fresh = await scanInventory({ cwd: process.cwd() });
    item = fresh.find((it) => it.id === id) ?? null;
    if (item) rememberCwd(process.cwd(), fresh);
  }
  if (!item) return json(res, 404, { error: 'not_found', id });

  try {
    const body = await readFile(item.source_path, 'utf8');
    return json(res, 200, { id, type: item.type, source_path: item.source_path, body });
  } catch (err) {
    return json(res, 500, { error: 'read_failed', message: err.message });
  }
}

const server = createServer(async (req, res) => {
  bumpIdle();
  try {
    const url = req.url.split('?')[0];
    if (url === '/healthz') return json(res, 200, { ok: true, pid: process.pid });
    if (url === '/api/items') return handleApiItems(req, res);
    const bodyMatch = url.match(/^\/api\/items\/(.+)\/body$/);
    if (bodyMatch) return handleApiItemBody(decodeURIComponent(bodyMatch[1]), res);
    return serveStatic(req, res);
  } catch (err) {
    json(res, 500, { error: 'internal', message: err.message });
  }
});

let idleTimer;
function bumpIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log(`catalog: idle for ${IDLE_SHUTDOWN_MS / 1000}s, shutting down`);
    server.close(() => process.exit(0));
  }, IDLE_SHUTDOWN_MS);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`catalog: listening on http://127.0.0.1:${PORT}`);
  bumpIdle();
});

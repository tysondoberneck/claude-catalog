#!/usr/bin/env node
// Local HTTP server for the catalog UI.
// Binds 127.0.0.1 only. Idle-shuts down after IDLE_SHUTDOWN_MS of no requests.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanInventory } from './scanner.mjs';
import { aggregateByItem } from './storage.mjs';

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

  const [inventory, usage] = await Promise.all([
    scanInventory({ cwd }),
    aggregateByItem(),
  ]);

  const items = inventory.map((item) => {
    const u = usage.get(item.id);
    return {
      ...item,
      usage: u ? { count: u.count, last_ts: u.last_ts, errors: u.errors } : { count: 0, last_ts: 0, errors: 0 },
    };
  });

  json(res, 200, { items, scanned_at: Date.now(), cwd });
}

const server = createServer(async (req, res) => {
  bumpIdle();
  try {
    const url = req.url.split('?')[0];
    if (url === '/healthz') return json(res, 200, { ok: true, pid: process.pid });
    if (url === '/api/items') return handleApiItems(req, res);
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

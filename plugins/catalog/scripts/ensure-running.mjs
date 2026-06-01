#!/usr/bin/env node
// /catalog entrypoint. Idempotent: if the server is already up, just open the browser.
//
// Behavior:
//   1. Resolve plugin root and target port (default 47823, override via $CATALOG_PORT).
//   2. Ping /healthz. If it answers, skip launch.
//   3. Otherwise spawn server/server.mjs detached, write its port to ~/.claude/catalog/port,
//      wait until /healthz answers (up to ~3s), then open the browser.
//   4. Print the final URL to stdout.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const SERVER_PATH = join(PLUGIN_ROOT, 'server', 'server.mjs');
const STATE_DIR = join(homedir(), '.claude', 'catalog');
const PORT_FILE = join(STATE_DIR, 'port');
const LOG_FILE = join(STATE_DIR, 'server.log');

const DEFAULT_PORT = Number(process.env.CATALOG_PORT) || 47823;

mkdirSync(STATE_DIR, { recursive: true });

async function ping(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(port, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping(port)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function openBrowser(url) {
  const cmd =
    platform() === 'darwin' ? 'open'
      : platform() === 'win32' ? 'cmd'
        : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '""', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  let port = DEFAULT_PORT;

  if (await ping(port)) {
    const url = `http://127.0.0.1:${port}`;
    openBrowser(url);
    console.log(url);
    return;
  }

  const logFd = openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [SERVER_PATH], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, CATALOG_PORT: String(port) },
  });
  child.unref();

  writeFileSync(PORT_FILE, String(port));

  const ok = await waitForHealth(port);
  const url = `http://127.0.0.1:${port}`;
  if (!ok) {
    console.error(`catalog: server did not respond on ${port}; see ${LOG_FILE}`);
    process.exit(1);
  }

  openBrowser(url);
  console.log(url);
}

main().catch((err) => {
  console.error('catalog: launcher failed:', err.message);
  process.exit(1);
});

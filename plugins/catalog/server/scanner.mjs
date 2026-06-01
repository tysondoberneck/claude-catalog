// Filesystem scanner.
//
// Walks three sources and normalizes to a single item shape:
//   1. Installed plugins:   ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
//        - the plugin itself (one item per plugin)
//        - its skills, commands, and declared MCP servers
//   2. User-global:         ~/.claude/skills, ~/.claude/commands,
//                           ~/.claude.json + ~/.claude/settings.json mcpServers
//   3. Project-local:       <cwd>/.claude/skills, <cwd>/.claude/commands,
//                           <cwd>/.mcp.json + <cwd>/.claude/settings.json mcpServers
//
// IDs are chosen to match what the hook scripts emit:
//   skill:<name>                  user/project skill
//   skill:<plugin>:<name>         plugin-namespaced skill
//   command:<name>                user/project slash command
//   command:<plugin>:<name>       plugin-namespaced slash command
//   mcp:<server>                  one item per declared MCP server (per-tool events
//                                 are rolled up to this id by server.mjs)
//   plugin:<plugin>               one item per installed plugin

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const PLUGIN_CACHE = join(HOME, '.claude', 'plugins', 'cache');
const USER_CLAUDE = join(HOME, '.claude');
const USER_CONFIG = join(HOME, '.claude.json');

// ---------- generic helpers ----------

async function safeReaddir(dir) {
  try { return await readdir(dir, { withFileTypes: true }); } catch { return []; }
}

async function safeReadJSON(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function safeStat(file) {
  try { return await stat(file); } catch { return null; }
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: text };
  const block = text.slice(3, end).trim();
  const fm = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, body: text.slice(end + 4).trimStart() };
}

function firstSentence(s, max = 220) {
  if (!s) return '';
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function dateFromStat(st) {
  return st?.birthtime?.toISOString() || st?.mtime?.toISOString() || new Date().toISOString();
}

// ---------- walkers ----------

async function readSkill(skillDir, { scope, pluginNamespace = null }) {
  const skillFile = join(skillDir, 'SKILL.md');
  const st = await safeStat(skillFile);
  if (!st || !st.isFile()) return null;

  const text = await readFile(skillFile, 'utf8').catch(() => '');
  const { fm, body } = parseFrontmatter(text);

  const name = fm.name || skillDir.split('/').pop();
  const fullName = pluginNamespace ? `${pluginNamespace}:${name}` : name;
  const description = fm.description || firstSentence(body.split('\n').find((l) => l.trim()) || '');

  return {
    id: `skill:${fullName}`,
    type: 'skill',
    scope,
    name: fullName,
    title: fullName,
    description,
    source_path: skillFile,
    date_added: dateFromStat(st),
    tags: pluginNamespace ? [`plugin:${pluginNamespace}`] : [],
  };
}

async function walkSkillsDir(dir, ctx) {
  const out = [];
  for (const ent of await safeReaddir(dir)) {
    if (!ent.isDirectory()) continue;
    const skill = await readSkill(join(dir, ent.name), ctx);
    if (skill) out.push(skill);
  }
  return out;
}

async function readCommand(file, { scope, pluginNamespace = null }) {
  const st = await safeStat(file);
  if (!st || !st.isFile()) return null;

  const text = await readFile(file, 'utf8').catch(() => '');
  const { fm, body } = parseFrontmatter(text);

  const base = file.split('/').pop().replace(/\.md$/, '');
  const fullName = pluginNamespace ? `${pluginNamespace}:${base}` : base;
  const description = fm.description || firstSentence(body.split('\n').find((l) => l.trim() && !l.startsWith('#')) || '');

  return {
    id: `command:${fullName}`,
    type: 'command',
    scope,
    name: fullName,
    title: `/${fullName}`,
    description,
    source_path: file,
    date_added: dateFromStat(st),
    tags: pluginNamespace ? [`plugin:${pluginNamespace}`] : [],
  };
}

async function walkCommandsDir(dir, ctx, depth = 0) {
  const out = [];
  for (const ent of await safeReaddir(dir)) {
    const full = join(dir, ent.name);
    if (ent.isDirectory() && depth < 2) {
      out.push(...(await walkCommandsDir(full, ctx, depth + 1)));
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      const cmd = await readCommand(full, ctx);
      if (cmd) out.push(cmd);
    }
  }
  return out;
}

async function readMcpServersFromConfig(file, { scope, pluginNamespace = null }) {
  const json = await safeReadJSON(file);
  if (!json || !json.mcpServers || typeof json.mcpServers !== 'object') return [];
  const st = await safeStat(file);
  const date_added = dateFromStat(st);
  return Object.entries(json.mcpServers).map(([server, cfg]) => ({
    id: `mcp:${server}`,
    type: 'mcp',
    scope,
    name: server,
    title: server,
    description: cfg?.command
      ? `MCP server. Command: \`${cfg.command}${cfg.args ? ' ' + (Array.isArray(cfg.args) ? cfg.args.join(' ') : cfg.args) : ''}\``
      : 'MCP server.',
    source_path: file,
    date_added,
    tags: pluginNamespace ? [`plugin:${pluginNamespace}`] : [],
  }));
}

async function scanInstalledPlugin(pluginRoot, pluginName, version) {
  const out = [];
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
  const manifest = await safeReadJSON(manifestPath) || {};
  const manifestStat = await safeStat(manifestPath);

  out.push({
    id: `plugin:${pluginName}`,
    type: 'plugin',
    scope: `plugin:${pluginName}`,
    name: pluginName,
    title: manifest.name || pluginName,
    description: manifest.description || `Installed plugin (${version}).`,
    source_path: manifestPath,
    date_added: dateFromStat(manifestStat),
    tags: [version],
  });

  const ctx = { scope: `plugin:${pluginName}`, pluginNamespace: pluginName };

  if (existsSync(join(pluginRoot, 'skills'))) {
    out.push(...(await walkSkillsDir(join(pluginRoot, 'skills'), ctx)));
  }
  if (existsSync(join(pluginRoot, 'commands'))) {
    out.push(...(await walkCommandsDir(join(pluginRoot, 'commands'), ctx)));
  }
  if (existsSync(join(pluginRoot, '.mcp.json'))) {
    out.push(...(await readMcpServersFromConfig(join(pluginRoot, '.mcp.json'), ctx)));
  }

  return out;
}

async function scanAllInstalledPlugins() {
  const out = [];
  for (const marketplace of await safeReaddir(PLUGIN_CACHE)) {
    if (!marketplace.isDirectory()) continue;
    const marketplaceDir = join(PLUGIN_CACHE, marketplace.name);
    for (const plugin of await safeReaddir(marketplaceDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = join(marketplaceDir, plugin.name);
      for (const version of await safeReaddir(pluginDir)) {
        if (!version.isDirectory()) continue;
        const versionDir = join(pluginDir, version.name);
        if (!existsSync(join(versionDir, '.in_use'))) continue;
        out.push(...(await scanInstalledPlugin(versionDir, plugin.name, version.name)));
      }
    }
  }
  return out;
}

async function scanUserScope() {
  const out = [];
  if (existsSync(join(USER_CLAUDE, 'skills'))) {
    out.push(...(await walkSkillsDir(join(USER_CLAUDE, 'skills'), { scope: 'user' })));
  }
  if (existsSync(join(USER_CLAUDE, 'commands'))) {
    out.push(...(await walkCommandsDir(join(USER_CLAUDE, 'commands'), { scope: 'user' })));
  }
  if (existsSync(USER_CONFIG)) {
    out.push(...(await readMcpServersFromConfig(USER_CONFIG, { scope: 'user' })));
  }
  if (existsSync(join(USER_CLAUDE, 'settings.json'))) {
    out.push(...(await readMcpServersFromConfig(join(USER_CLAUDE, 'settings.json'), { scope: 'user' })));
  }
  return out;
}

async function scanProjectScope(cwd) {
  const out = [];
  const projDir = join(cwd, '.claude');
  if (existsSync(join(projDir, 'skills'))) {
    out.push(...(await walkSkillsDir(join(projDir, 'skills'), { scope: 'project' })));
  }
  if (existsSync(join(projDir, 'commands'))) {
    out.push(...(await walkCommandsDir(join(projDir, 'commands'), { scope: 'project' })));
  }
  if (existsSync(join(cwd, '.mcp.json'))) {
    out.push(...(await readMcpServersFromConfig(join(cwd, '.mcp.json'), { scope: 'project' })));
  }
  if (existsSync(join(projDir, 'settings.json'))) {
    out.push(...(await readMcpServersFromConfig(join(projDir, 'settings.json'), { scope: 'project' })));
  }
  if (existsSync(join(projDir, 'settings.local.json'))) {
    out.push(...(await readMcpServersFromConfig(join(projDir, 'settings.local.json'), { scope: 'project' })));
  }
  return out;
}

function dedupeLastWins(items) {
  const map = new Map();
  for (const it of items) map.set(it.id, it);
  return [...map.values()];
}

export async function scanInventory({ cwd = process.cwd() } = {}) {
  const [plugins, user, project] = await Promise.all([
    scanAllInstalledPlugins(),
    scanUserScope(),
    scanProjectScope(cwd),
  ]);
  // Project overrides user overrides plugins for any id collisions.
  return dedupeLastWins([...plugins, ...user, ...project]);
}

import { h, render } from 'https://esm.sh/preact@10.22.0';
import { useEffect, useMemo, useState } from 'https://esm.sh/preact@10.22.0/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import { marked } from 'https://esm.sh/marked@12.0.2';

const html = htm.bind(h);

const TYPES = ['all', 'skill', 'command', 'mcp', 'plugin', 'stale'];
const SORTS = [
  { id: 'recent',     label: 'Recently used' },
  { id: 'count',      label: 'Most used' },
  { id: 'date_added', label: 'Date added' },
  { id: 'name',       label: 'Name' },
];

const CHIP_BY_TYPE = {
  skill:   'ring-amber-500/40    text-amber-700    dark:text-amber-300',
  command: 'ring-blue-500/40     text-blue-700     dark:text-blue-300',
  mcp:     'ring-emerald-500/40  text-emerald-700  dark:text-emerald-300',
  plugin:  'ring-zinc-400/60     text-zinc-700     dark:text-zinc-300',
  stale:   'ring-rose-500/40     text-rose-700     dark:text-rose-300',
};

const WINDOWS = [
  { id: '7',   label: 'Last 7 days',  days: 7 },
  { id: '14',  label: 'Last 14 days', days: 14 },
  { id: '30',  label: 'Last 30 days', days: 30 },
  { id: '90',  label: 'Last 90 days', days: 90 },
  { id: '180', label: 'Last 6 months', days: 180 },
  { id: 'all', label: 'All time',     days: Infinity },
];

function isStaleForWindow(item, days) {
  if (!Number.isFinite(days)) return false; // "all time" — nothing is stale
  const last = item.usage?.last_ts ?? 0;
  if (last === 0) return true;
  return Date.now() - last > days * 24 * 60 * 60 * 1000;
}

function relTime(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function TypeChip({ type }) {
  const cls = CHIP_BY_TYPE[type] ?? CHIP_BY_TYPE.plugin;
  return html`<span class="px-1.5 py-0.5 rounded ring-1 ${cls} text-[10px] font-medium uppercase tracking-wider mono">${type}</span>`;
}

function ScopeBadge({ scope }) {
  if (scope === 'project') {
    return html`<span class="px-1.5 py-0.5 rounded ring-1 ring-rose-500/40 text-rose-700 dark:text-rose-300 text-[10px] font-medium uppercase tracking-wider mono">project</span>`;
  }
  if (scope === 'builtin') {
    return html`<span class="px-1.5 py-0.5 rounded ring-1 ring-zinc-400/60 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium uppercase tracking-wider mono" title="Built-in Claude Code command">built-in</span>`;
  }
  if (scope === 'external') {
    return html`<span class="px-1.5 py-0.5 rounded ring-1 ring-zinc-400/60 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium uppercase tracking-wider mono" title="Used here but the source file isn't in the current scan — likely from another project or an uninstalled plugin.">external</span>`;
  }
  if (scope?.startsWith?.('plugin:')) {
    return html`<span class="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 text-[10px] mono">${scope}</span>`;
  }
  return null;
}

function isOrphan(item) {
  return item.scope === 'builtin' || item.scope === 'external';
}

// --- Sparkline ---
// Smooth line over `data` (length N, oldest first, today last). Renders nothing
// if every value is zero so unused items honestly look unused.
function smoothPath(data, width, height, pad = 1.5) {
  if (data.length < 2) return '';
  const max = Math.max(...data, 1);
  const innerW = width;
  const innerH = height - pad * 2;
  const x = (i) => (i * innerW) / (data.length - 1);
  const y = (v) => pad + innerH - (v / max) * innerH;

  let d = `M ${x(0).toFixed(2)},${y(data[0]).toFixed(2)}`;
  for (let i = 1; i < data.length; i++) {
    const px = x(i - 1), py = y(data[i - 1]);
    const cx = x(i),     cy = y(data[i]);
    // Midpoint-quadratic smoothing
    const mx = (px + cx) / 2;
    const my = (py + cy) / 2;
    d += ` Q ${px.toFixed(2)},${py.toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`;
    if (i === data.length - 1) {
      d += ` T ${cx.toFixed(2)},${cy.toFixed(2)}`;
    }
  }
  return d;
}

function Sparkline({ data, width = 120, height = 22 }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data);
  if (max === 0) {
    return html`<div style="width:${width}px;height:${height}px"></div>`;
  }
  const linePath = smoothPath(data, width, height);
  // Build a closed area path under the line for the soft fill.
  const areaPath = `${linePath} L ${width.toFixed(2)},${height.toFixed(2)} L 0,${height.toFixed(2)} Z`;
  return html`
    <svg width=${width} height=${height} viewBox="0 0 ${width} ${height}" class="text-amber-500 dark:text-amber-400 block">
      <path d=${areaPath} fill="currentColor" fill-opacity="0.14" stroke="none"/>
      <path d=${linePath} fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

// --- Editor links ---
function EditorLinks({ path }) {
  if (!path) return null;
  const parent = path.replace(/\/[^/]*$/, '');
  return html`
    <div class="flex flex-wrap gap-2 text-[11px]">
      <a href=${`vscode://file/${path}`} class="px-2 py-0.5 rounded ring-1 ring-zinc-300 dark:ring-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 mono">VS Code</a>
      <a href=${`cursor://file/${path}`} class="px-2 py-0.5 rounded ring-1 ring-zinc-300 dark:ring-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 mono">Cursor</a>
      <a href=${`file://${parent}`} class="px-2 py-0.5 rounded ring-1 ring-zinc-300 dark:ring-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 mono">Reveal</a>
    </div>
  `;
}

// --- Source body lazy loader ---
function SourceBody({ id }) {
  const [state, setState] = useState({ status: 'idle' });
  // Default open — the rendered markdown is usually the most useful part of
  // the detail pane, so don't hide it behind a click. Users can collapse if
  // they want a shorter pane.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open || state.status !== 'idle') return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/items/${encodeURIComponent(id)}/body`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setState({ status: 'ok', body: data.body }); })
      .catch((err) => { if (!cancelled) setState({ status: 'error', message: err.message }); });
    return () => { cancelled = true; };
  }, [open, id]);

  // Reset state when item changes, keeping the pane open so the new item's
  // body loads immediately.
  useEffect(() => {
    setState({ status: 'idle' });
    setOpen(true);
  }, [id]);

  const rendered = useMemo(() => {
    if (state.status !== 'ok') return null;
    return { __html: marked.parse(state.body, { mangle: false, headerIds: false }) };
  }, [state]);

  return html`
    <details open=${open} onToggle=${(e) => setOpen(e.currentTarget.open)}>
      <summary class="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 select-none inline-flex items-center gap-1">
        <span class="mono">${open ? '▾' : '▸'}</span> View source
      </summary>
      <div class="mt-3">
        ${state.status === 'loading' && html`<div class="text-xs text-zinc-500">Loading…</div>`}
        ${state.status === 'error' && html`<div class="text-xs text-rose-600 dark:text-rose-400">Could not load: ${state.message}</div>`}
        ${state.status === 'ok' && html`<div class="md text-zinc-800 dark:text-zinc-200" dangerouslySetInnerHTML=${rendered}></div>`}
      </div>
    </details>
  `;
}

// --- Theme + view-mode toggles ---
function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return html`
    <button
      onClick=${onToggle}
      title=${isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition"
    >
      ${isDark ? html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ` : html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      `}
    </button>
  `;
}

function ViewModeToggle({ viewMode, onToggle }) {
  const isTree = viewMode === 'tree';
  return html`
    <button
      onClick=${onToggle}
      title=${isTree ? 'Switch to flat list' : 'Group by plugin (tree view)'}
      class="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition"
    >
      ${isTree ? html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      ` : html`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 5h6v6H3zM15 5h6v6h-6zM3 17h6v4H3zM15 13h6v8h-6z"/>
          <path d="M9 8h6M18 11v2M6 11v6"/>
        </svg>
      `}
    </button>
  `;
}

// --- Row used in both flat and tree modes ---
function ItemRow({ item, selected, onSelect, indent = 0 }) {
  // For orphans (built-in / external) we skip the description line — the
  // text is boilerplate and just adds visual noise across many rows.
  const showDesc = !isOrphan(item) && item.description;
  return html`
    <li
      onClick=${() => onSelect(item)}
      class="py-3 cursor-pointer transition border-l-2 ${selected
        ? 'bg-amber-50 dark:bg-amber-500/10 border-l-amber-500'
        : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 border-l-transparent'}"
      style=${`padding-left: ${16 + indent * 16}px; padding-right: 16px;`}
    >
      <div class="flex items-center gap-2 flex-wrap">
        <${TypeChip} type=${item.type} />
        <span class="font-medium text-sm truncate">${item.title || item.name}</span>
        <${ScopeBadge} scope=${item.scope} />
      </div>
      ${showDesc && html`<div class="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">${item.description}</div>`}
      <div class="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500 mono">
        <span>${item.usage?.count ?? 0} uses</span>
        <span>last ${relTime(item.usage?.last_ts)}</span>
        <span class="ml-auto"><${Sparkline} data=${item.usage?.daily} /></span>
      </div>
    </li>
  `;
}

// --- Tree groupings ---
function buildGroups(items, cwd) {
  // Returns ordered groups: [{ kind, label, items, parent? }, ...]
  // For plugins, parent is the plugin item itself (rendered as a header).
  const pluginParents = new Map(); // pluginName -> item
  const pluginChildren = new Map(); // pluginName -> child items[]
  const userItems = [];
  const projectItems = [];

  for (const it of items) {
    if (it.type === 'plugin') {
      pluginParents.set(it.name, it);
      continue;
    }
    if (it.scope?.startsWith?.('plugin:')) {
      const pluginName = it.scope.slice('plugin:'.length);
      if (!pluginChildren.has(pluginName)) pluginChildren.set(pluginName, []);
      pluginChildren.get(pluginName).push(it);
      continue;
    }
    if (it.scope === 'project') projectItems.push(it);
    else userItems.push(it);
  }

  const pluginGroups = [];
  for (const [name, parent] of pluginParents) {
    const children = pluginChildren.get(name) ?? [];
    pluginGroups.push({ kind: 'plugin', name, parent, children });
  }
  pluginGroups.sort((a, b) => (b.parent.usage?.count ?? 0) - (a.parent.usage?.count ?? 0) || a.name.localeCompare(b.name));

  return {
    pluginGroups,
    userItems,
    projectItems,
    projectLabel: cwd ? `Project · ${cwd.split('/').slice(-1)[0]}` : 'Project',
  };
}

// --- App ---
function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState(localStorage.getItem('catalog.sort') || 'recent');
  const [selected, setSelected] = useState(null);
  const [scannedAt, setScannedAt] = useState(null);
  const [cwd, setCwd] = useState('');
  const [theme, setTheme] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [viewMode, setViewMode] = useState(localStorage.getItem('catalog.viewMode') || 'list');
  const [expanded, setExpanded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('catalog.expanded') || '[]')); }
    catch { return new Set(); }
  });
  const [windowId, setWindowId] = useState(localStorage.getItem('catalog.window') || '14');
  const windowDays = (WINDOWS.find((w) => w.id === windowId) ?? WINDOWS[1]).days;
  const [showBuiltins, setShowBuiltins] = useState(localStorage.getItem('catalog.showBuiltins') === '1');
  function toggleBuiltins() {
    const next = !showBuiltins;
    setShowBuiltins(next);
    try { localStorage.setItem('catalog.showBuiltins', next ? '1' : '0'); } catch (_) {}
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('catalog.theme', next); } catch (_) {}
  }
  function toggleViewMode() {
    const next = viewMode === 'tree' ? 'list' : 'tree';
    setViewMode(next);
    try { localStorage.setItem('catalog.viewMode', next); } catch (_) {}
  }
  function togglePlugin(name) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name); else next.add(name);
    setExpanded(next);
    try { localStorage.setItem('catalog.expanded', JSON.stringify([...next])); } catch (_) {}
  }
  function expandAllPlugins(names) {
    const next = new Set(names);
    setExpanded(next);
    try { localStorage.setItem('catalog.expanded', JSON.stringify([...next])); } catch (_) {}
  }
  function collapseAllPlugins() {
    setExpanded(new Set());
    try { localStorage.setItem('catalog.expanded', '[]'); } catch (_) {}
  }

  // Persist sort + window + auto-switch sort when stale is active.
  useEffect(() => {
    try { localStorage.setItem('catalog.sort', sort); } catch (_) {}
  }, [sort]);
  useEffect(() => {
    try { localStorage.setItem('catalog.window', windowId); } catch (_) {}
  }, [windowId]);
  useEffect(() => {
    if (type === 'stale' && sort !== 'date_added') setSort('date_added');
  }, [type]);

  async function load() {
    try {
      const res = await fetch('/api/items');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items);
      setScannedAt(data.scanned_at);
      setCwd(data.cwd);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  // Search filter only (no type, no window). Tree view uses this so plugin
  // headers and their children always group correctly regardless of which
  // type pill is active — the type filter is applied at the leaf level
  // inside renderTree so children counts reflect the full inventory.
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = items.filter((it) => showBuiltins || it.scope !== 'builtin');
    if (!q) return visible;
    return visible.filter((it) =>
      it.name?.toLowerCase().includes(q) ||
      it.title?.toLowerCase().includes(q) ||
      it.description?.toLowerCase().includes(q)
    );
  }, [items, query, showBuiltins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items.filter((it) => {
      // Built-in Claude Code commands are hidden by default — they clutter the
      // catalog with `/clear`, `/compact`, etc. that aren't really "installed
      // content". Opt back in via the show-built-ins toggle.
      if (!showBuiltins && it.scope === 'builtin') return false;
      const stale = isStaleForWindow(it, windowDays);
      if (type === 'stale') {
        if (!stale) return false;
      } else {
        // Non-stale views hide items outside the activity window so the
        // catalog stays focused on what you actually use right now.
        if (stale) return false;
        if (type !== 'all' && it.type !== type) return false;
      }
      if (!q) return true;
      return (
        it.name?.toLowerCase().includes(q) ||
        it.title?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q)
      );
    });

    out.sort((a, b) => {
      if (sort === 'recent')     return (b.usage?.last_ts ?? 0) - (a.usage?.last_ts ?? 0);
      if (sort === 'count')      return (b.usage?.count ?? 0)   - (a.usage?.count ?? 0);
      if (sort === 'date_added') return (b.date_added ?? '').localeCompare(a.date_added ?? '');
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return out;
  }, [items, query, type, sort, windowDays, showBuiltins]);

  useEffect(() => {
    if (!selected && filtered.length) { setSelected(filtered[0]); return; }
    // Selection vanished from inventory entirely — reset to first visible.
    if (selected && !items.find((it) => it.id === selected.id)) {
      setSelected(filtered[0] ?? null);
      return;
    }
    // Selection still exists but isn't in the current filtered view (user
    // switched type / window / built-ins). Auto-advance to the first visible
    // row so the detail pane always shows something from the current list.
    if (selected && filtered.length && !filtered.find((it) => it.id === selected.id)) {
      setSelected(filtered[0]);
    }
  }, [filtered, items]);

  const counts = useMemo(() => {
    // Type-pill counts only include items inside the activity window so the
    // numbers match what the user actually sees in the list.
    const c = { all: 0, skill: 0, command: 0, mcp: 0, plugin: 0, stale: 0 };
    for (const it of items) {
      // Mirror the filter: hide built-ins from counts unless opted in.
      if (!showBuiltins && it.scope === 'builtin') continue;
      if (isStaleForWindow(it, windowDays)) {
        c.stale += 1;
      } else {
        c.all += 1;
        c[it.type] = (c[it.type] ?? 0) + 1;
      }
    }
    return c;
  }, [items, windowDays, showBuiltins]);

  // Total built-ins in inventory (regardless of toggle), so the toggle can
  // show a count next to the label.
  const builtinCount = useMemo(
    () => items.reduce((n, it) => n + (it.scope === 'builtin' ? 1 : 0), 0),
    [items],
  );

  const totalUses = useMemo(
    () => items.reduce((acc, it) => acc + (it.usage?.count ?? 0), 0),
    [items],
  );

  // Tree view groups from the search-only filtered list — the type filter is
  // applied to leaves inside renderTree so plugin headers and their child
  // counts always reflect the full inventory.
  const groups = useMemo(() => buildGroups(searchFiltered, cwd), [searchFiltered, cwd]);

  // Predicate for leaf-level filtering inside the tree view.
  function leafVisible(it) {
    if (type === 'stale') return isStaleForWindow(it, windowDays);
    if (type !== 'all' && it.type !== type) return false;
    return true;
  }

  function renderFlat() {
    return html`
      <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
        ${filtered.map((it) => html`
          <${ItemRow}
            key=${it.id}
            item=${it}
            selected=${selected?.id === it.id}
            onSelect=${setSelected}
          />
        `)}
      </ul>
    `;
  }

  function renderTree() {
    // Apply the type filter at the leaf level. Plugin parents show all
    // children counts of the visible kind. When the type filter is "plugin",
    // we don't restrict children (browsing what's inside a plugin makes more
    // sense than hiding everything).
    // Plugin-provided children only surface when the user is browsing plugins
    // (type === 'all' or 'plugin'); skill/command/mcp views are reserved for
    // user- and project-scoped items.
    const showPluginSection = type === 'all' || type === 'plugin' || type === 'stale';
    const visibleChildrenOf = (g) => g.children.filter((c) => type === 'plugin' || leafVisible(c));
    const groupsToShow = !showPluginSection
      ? []
      : groups.pluginGroups
          .map((g) => ({ ...g, visibleChildren: visibleChildrenOf(g) }))
          .filter((g) => type === 'all' || type === 'plugin' || g.visibleChildren.length > 0);

    const userItemsVisible    = type === 'plugin' ? [] : groups.userItems.filter(leafVisible);
    const projectItemsVisible = type === 'plugin' ? [] : groups.projectItems.filter(leafVisible);

    const allExpanded = groupsToShow.length > 0 && groupsToShow.every((g) => expanded.has(g.name));

    return html`
      <div>
        ${groupsToShow.length ? html`
          <div class="px-4 pt-3 pb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
            <span>Installed plugins · ${groupsToShow.length}</span>
            <button
              onClick=${() => allExpanded ? collapseAllPlugins() : expandAllPlugins(groupsToShow.map((g) => g.name))}
              class="normal-case tracking-normal text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >${allExpanded ? 'Collapse all' : 'Expand all'}</button>
          </div>
          <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
            ${groupsToShow.map((g) => html`
              <li key=${g.name}>
                <div
                  onClick=${() => { setSelected(g.parent); togglePlugin(g.name); }}
                  class="px-4 py-2 cursor-pointer flex items-center gap-2 select-none border-l-2 ${selected?.id === g.parent.id
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-l-amber-500'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 border-l-transparent'}"
                >
                  <span class="text-zinc-500 mono text-xs w-3 inline-block">${expanded.has(g.name) ? '▾' : '▸'}</span>
                  <${TypeChip} type="plugin" />
                  <span class="font-medium text-sm">${g.parent.title || g.parent.name}</span>
                  <span class="text-[11px] text-zinc-500 mono ml-auto">${g.visibleChildren.length} items · ${g.parent.usage?.count ?? 0} uses</span>
                </div>
                ${expanded.has(g.name) && g.visibleChildren.length > 0 && html`
                  <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 bg-zinc-50/50 dark:bg-zinc-900/40">
                    ${g.visibleChildren.map((c) => html`
                      <${ItemRow}
                        key=${c.id}
                        item=${c}
                        selected=${selected?.id === c.id}
                        onSelect=${setSelected}
                        indent=${1}
                      />
                    `)}
                  </ul>
                `}
              </li>
            `)}
          </ul>
        ` : null}

        ${userItemsVisible.length ? html`
          <div class="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">User · ${userItemsVisible.length}</div>
          <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
            ${userItemsVisible.map((it) => html`
              <${ItemRow} key=${it.id} item=${it} selected=${selected?.id === it.id} onSelect=${setSelected} />
            `)}
          </ul>
        ` : null}

        ${projectItemsVisible.length ? html`
          <div class="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">${groups.projectLabel} · ${projectItemsVisible.length}</div>
          <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
            ${projectItemsVisible.map((it) => html`
              <${ItemRow} key=${it.id} item=${it} selected=${selected?.id === it.id} onSelect=${setSelected} />
            `)}
          </ul>
        ` : null}
      </div>
    `;
  }

  return html`
    <div class="h-full flex flex-col">
      <header class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="px-5 pt-3 pb-2 flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-amber-500 mono text-sm">▍</span>
            <span class="font-semibold tracking-tight">catalog</span>
            <span class="text-zinc-500 text-xs mono truncate max-w-[28ch]" title=${cwd}>${cwd || ''}</span>
          </div>
          <div class="flex-1 max-w-2xl">
            <input
              type="search"
              placeholder="Search skills, commands, MCP tools, plugins…"
              value=${query}
              onInput=${(e) => setQuery(e.currentTarget.value)}
              class="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-1.5 text-sm placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
          <div class="ml-auto flex items-center gap-1">
            <${ViewModeToggle} viewMode=${viewMode} onToggle=${toggleViewMode} />
            <${ThemeToggle} theme=${theme} onToggle=${toggleTheme} />
          </div>
        </div>
        <div class="px-5 pb-3 flex items-center gap-3 flex-wrap">
          <div class="flex gap-1">
            ${TYPES.map((t) => html`
              <button
                key=${t}
                onClick=${() => setType(t)}
                class="px-2.5 py-1 rounded text-xs font-medium transition ${type === t
                  ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800'}"
              >
                ${t}
                <span class="ml-1 text-[10px] opacity-60 mono">${counts[t] ?? 0}</span>
              </button>
            `)}
          </div>
          <div class="ml-auto flex items-center gap-2">
            <button
              onClick=${toggleBuiltins}
              title="Toggle visibility of built-in Claude Code commands like /clear and /compact"
              class="px-2.5 py-1 rounded text-xs transition border ${showBuiltins
                ? 'bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-white text-zinc-600 hover:bg-zinc-100 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:border-zinc-800'}"
            >
              ${showBuiltins ? '✓ ' : ''}built-ins
              <span class="ml-1 text-[10px] opacity-60 mono">${builtinCount}</span>
            </button>
            <select
              value=${windowId}
              onChange=${(e) => setWindowId(e.currentTarget.value)}
              title="Activity window — items unused beyond this are stale"
              class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1.5 text-xs"
            >
              ${WINDOWS.map((w) => html`<option key=${w.id} value=${w.id}>${w.label}</option>`)}
            </select>
            <select
              value=${sort}
              onChange=${(e) => setSort(e.currentTarget.value)}
              class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1.5 text-xs"
            >
              ${SORTS.map((s) => html`<option key=${s.id} value=${s.id}>${s.label}</option>`)}
            </select>
          </div>
        </div>
      </header>

      <main class="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] overflow-hidden">
        <section class="overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          ${loading && html`<div class="p-5 text-zinc-500 text-sm">Loading…</div>`}
          ${error && html`<div class="p-5 text-rose-600 dark:text-rose-400 text-sm">Failed to load: ${error}</div>`}
          ${!loading && !error && filtered.length === 0 && html`
            <div class="p-5 text-zinc-500 text-sm">No items match.</div>
          `}
          ${!loading && !error && (viewMode === 'tree' ? renderTree() : renderFlat())}
        </section>

        <section class="overflow-y-auto bg-white dark:bg-zinc-900/40">
          ${selected ? html`
            <article class="p-6">
              <div class="flex items-center gap-2 mb-2">
                <${TypeChip} type=${selected.type} />
                <${ScopeBadge} scope=${selected.scope} />
                ${isStaleForWindow(selected, windowDays) && html`<${TypeChip} type="stale" />`}
              </div>
              <h1 class="text-xl font-semibold tracking-tight">${selected.title || selected.name}</h1>
              <p class="mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">${selected.description}</p>

              <div class="mt-5">
                <${Sparkline} data=${selected.usage?.daily} width=${240} height=${48} />
                <div class="mt-1 text-[11px] text-zinc-500 mono">60-day usage</div>
              </div>

              <dl class="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Uses</dt>
                  <dd class="mono">${selected.usage?.count ?? 0}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Last used</dt>
                  <dd class="mono">${relTime(selected.usage?.last_ts)}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Errors</dt>
                  <dd class="mono">${selected.usage?.errors ?? 0}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500" title="When the catalog scanner first saw this file — usually plugin install or cache extraction date, not install date.">Indexed</dt>
                  <dd class="mono">${selected.date_added?.slice(0, 10) || '—'}</dd>
                </div>
                ${selected.source_path ? html`
                  <div class="col-span-2">
                    <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Source</dt>
                    <dd class="mt-1 space-y-2">
                      <div class="mono text-xs break-all text-zinc-700 dark:text-zinc-400">${selected.source_path}</div>
                      <${EditorLinks} path=${selected.source_path} />
                      <${SourceBody} id=${selected.id} />
                    </dd>
                  </div>
                ` : null}
              </dl>

              ${selected.tags?.length ? html`
                <div class="mt-4 flex flex-wrap gap-1">
                  ${selected.tags.map((t) => html`<span class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px] mono">${t}</span>`)}
                </div>
              ` : null}
            </article>
          ` : html`<div class="p-6 text-zinc-500 text-sm">Select an item.</div>`}
        </section>
      </main>

      <footer class="border-t border-zinc-200 dark:border-zinc-800 px-5 py-2 text-[11px] text-zinc-500 mono flex justify-between">
        <span>${counts.all} active in ${(WINDOWS.find(w => w.id === windowId) ?? WINDOWS[1]).label.toLowerCase()} · ${counts.stale} stale · ${items.length} total · ${totalUses.toLocaleString()} uses</span>
        <span>${scannedAt ? `scanned ${new Date(scannedAt).toLocaleTimeString()}` : ''}</span>
      </footer>
    </div>
  `;
}

render(h(App), document.getElementById('app'));

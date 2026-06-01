import { h, render } from 'https://esm.sh/preact@10.22.0';
import { useEffect, useMemo, useState } from 'https://esm.sh/preact@10.22.0/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

const TYPES = ['all', 'skill', 'command', 'mcp', 'plugin'];
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
};

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
  if (scope?.startsWith?.('plugin:')) {
    return html`<span class="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 text-[10px] mono">${scope}</span>`;
  }
  return null;
}

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

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState(null);
  const [scannedAt, setScannedAt] = useState(null);
  const [cwd, setCwd] = useState('');
  const [theme, setTheme] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('catalog.theme', next); } catch (_) {}
  }

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items.filter((it) => {
      if (type !== 'all' && it.type !== type) return false;
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
  }, [items, query, type, sort]);

  useEffect(() => {
    if (!selected && filtered.length) setSelected(filtered[0]);
    if (selected && !filtered.find((it) => it.id === selected.id)) setSelected(filtered[0] ?? null);
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { all: items.length, skill: 0, command: 0, mcp: 0, plugin: 0 };
    for (const it of items) c[it.type] = (c[it.type] ?? 0) + 1;
    return c;
  }, [items]);

  const totalUses = useMemo(
    () => items.reduce((acc, it) => acc + (it.usage?.count ?? 0), 0),
    [items],
  );

  return html`
    <div class="h-full flex flex-col">
      <header class="border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 flex items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-amber-500 mono text-sm">▍</span>
          <span class="font-semibold tracking-tight">catalog</span>
          <span class="text-zinc-500 text-xs mono truncate max-w-[28ch]" title=${cwd}>${cwd || ''}</span>
        </div>
        <div class="flex-1 max-w-xl">
          <input
            type="search"
            placeholder="Search skills, commands, MCP tools, plugins…"
            value=${query}
            onInput=${(e) => setQuery(e.currentTarget.value)}
            class="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-1.5 text-sm placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
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
        <select
          value=${sort}
          onChange=${(e) => setSort(e.currentTarget.value)}
          class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1.5 text-xs"
        >
          ${SORTS.map((s) => html`<option key=${s.id} value=${s.id}>${s.label}</option>`)}
        </select>
        <${ThemeToggle} theme=${theme} onToggle=${toggleTheme} />
      </header>

      <main class="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] overflow-hidden">
        <section class="overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          ${loading && html`<div class="p-5 text-zinc-500 text-sm">Loading…</div>`}
          ${error && html`<div class="p-5 text-rose-600 dark:text-rose-400 text-sm">Failed to load: ${error}</div>`}
          ${!loading && !error && filtered.length === 0 && html`
            <div class="p-5 text-zinc-500 text-sm">No items match.</div>
          `}
          <ul class="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
            ${filtered.map((it) => html`
              <li
                key=${it.id}
                onClick=${() => setSelected(it)}
                class="px-4 py-3 cursor-pointer transition border-l-2 ${selected?.id === it.id
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-l-amber-500'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 border-l-transparent'}"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <${TypeChip} type=${it.type} />
                  <span class="font-medium text-sm truncate">${it.title || it.name}</span>
                  <${ScopeBadge} scope=${it.scope} />
                </div>
                <div class="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">${it.description}</div>
                <div class="mt-1.5 flex gap-3 text-[11px] text-zinc-500 mono">
                  <span>${it.usage?.count ?? 0} uses</span>
                  <span>last ${relTime(it.usage?.last_ts)}</span>
                </div>
              </li>
            `)}
          </ul>
        </section>

        <section class="overflow-y-auto bg-white dark:bg-zinc-900/40">
          ${selected ? html`
            <article class="p-6">
              <div class="flex items-center gap-2 mb-2">
                <${TypeChip} type=${selected.type} />
                <${ScopeBadge} scope=${selected.scope} />
              </div>
              <h1 class="text-xl font-semibold tracking-tight">${selected.title || selected.name}</h1>
              <p class="mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">${selected.description}</p>

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
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Date added</dt>
                  <dd class="mono">${selected.date_added?.slice(0, 10) || '—'}</dd>
                </div>
                <div class="col-span-2">
                  <dt class="text-[11px] uppercase tracking-wider text-zinc-500">Source</dt>
                  <dd class="mono text-xs break-all text-zinc-700 dark:text-zinc-400">${selected.source_path}</dd>
                </div>
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
        <span>${items.length} items · ${totalUses.toLocaleString()} total uses · refreshes every 10s</span>
        <span>${scannedAt ? `scanned ${new Date(scannedAt).toLocaleTimeString()}` : ''}</span>
      </footer>
    </div>
  `;
}

render(h(App), document.getElementById('app'));

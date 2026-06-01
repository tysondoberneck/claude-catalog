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
  return `${d}d ago`;
}

function TypeChip({ type }) {
  const color = {
    skill: 'bg-emerald-500/20 text-emerald-300',
    command: 'bg-sky-500/20 text-sky-300',
    mcp: 'bg-violet-500/20 text-violet-300',
    plugin: 'bg-amber-500/20 text-amber-300',
  }[type] ?? 'bg-slate-500/20 text-slate-300';
  return html`<span class="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${color}">${type}</span>`;
}

function ScopeBadge({ scope }) {
  if (scope === 'project') return html`<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-medium uppercase tracking-wider">project</span>`;
  if (scope?.startsWith?.('plugin:')) return html`<span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] mono">${scope}</span>`;
  return null;
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

  return html`
    <div class="h-full flex flex-col">
      <header class="border-b border-slate-800 px-5 py-3 flex items-center gap-4">
        <div class="flex items-center gap-2">
          <span class="text-emerald-400 mono text-sm">▍</span>
          <span class="font-semibold tracking-tight">catalog</span>
          <span class="text-slate-500 text-xs mono">${cwd || ''}</span>
        </div>
        <div class="flex-1 max-w-xl">
          <input
            type="search"
            placeholder="Search skills, commands, MCP tools, plugins…"
            value=${query}
            onInput=${(e) => setQuery(e.currentTarget.value)}
            class="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div class="flex gap-1">
          ${TYPES.map((t) => html`
            <button
              key=${t}
              onClick=${() => setType(t)}
              class="px-2.5 py-1 rounded text-xs font-medium transition ${type === t ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}"
            >
              ${t}
              <span class="ml-1 text-[10px] opacity-60">${counts[t] ?? 0}</span>
            </button>
          `)}
        </div>
        <select
          value=${sort}
          onChange=${(e) => setSort(e.currentTarget.value)}
          class="bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs"
        >
          ${SORTS.map((s) => html`<option key=${s.id} value=${s.id}>${s.label}</option>`)}
        </select>
      </header>

      <main class="flex-1 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] overflow-hidden">
        <section class="overflow-y-auto border-r border-slate-800">
          ${loading && html`<div class="p-5 text-slate-500 text-sm">Loading…</div>`}
          ${error && html`<div class="p-5 text-rose-400 text-sm">Failed to load: ${error}</div>`}
          ${!loading && !error && filtered.length === 0 && html`
            <div class="p-5 text-slate-500 text-sm">No items match.</div>
          `}
          <ul class="divide-y divide-slate-800/80">
            ${filtered.map((it) => html`
              <li
                key=${it.id}
                onClick=${() => setSelected(it)}
                class="px-4 py-3 cursor-pointer transition ${selected?.id === it.id ? 'bg-slate-800/60' : 'hover:bg-slate-900'}"
              >
                <div class="flex items-center gap-2">
                  <${TypeChip} type=${it.type} />
                  <span class="font-medium text-sm truncate">${it.title || it.name}</span>
                  <${ScopeBadge} scope=${it.scope} />
                </div>
                <div class="mt-1 text-xs text-slate-400 line-clamp-2">${it.description}</div>
                <div class="mt-1.5 flex gap-3 text-[11px] text-slate-500 mono">
                  <span>${it.usage?.count ?? 0} uses</span>
                  <span>last ${relTime(it.usage?.last_ts)}</span>
                </div>
              </li>
            `)}
          </ul>
        </section>

        <section class="overflow-y-auto">
          ${selected ? html`
            <article class="p-6">
              <div class="flex items-center gap-2 mb-1">
                <${TypeChip} type=${selected.type} />
                <${ScopeBadge} scope=${selected.scope} />
              </div>
              <h1 class="text-xl font-semibold tracking-tight">${selected.title || selected.name}</h1>
              <p class="mt-2 text-sm text-slate-300 leading-relaxed">${selected.description}</p>

              <dl class="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-slate-500">Uses</dt>
                  <dd class="mono">${selected.usage?.count ?? 0}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-slate-500">Last used</dt>
                  <dd class="mono">${relTime(selected.usage?.last_ts)}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-slate-500">Errors</dt>
                  <dd class="mono">${selected.usage?.errors ?? 0}</dd>
                </div>
                <div>
                  <dt class="text-[11px] uppercase tracking-wider text-slate-500">Date added</dt>
                  <dd class="mono">${selected.date_added?.slice(0, 10) || '—'}</dd>
                </div>
                <div class="col-span-2">
                  <dt class="text-[11px] uppercase tracking-wider text-slate-500">Source</dt>
                  <dd class="mono text-xs break-all text-slate-300">${selected.source_path}</dd>
                </div>
              </dl>

              ${selected.tags?.length ? html`
                <div class="mt-4 flex flex-wrap gap-1">
                  ${selected.tags.map((t) => html`<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">${t}</span>`)}
                </div>
              ` : null}
            </article>
          ` : html`<div class="p-6 text-slate-500 text-sm">Select an item.</div>`}
        </section>
      </main>

      <footer class="border-t border-slate-800 px-5 py-2 text-[11px] text-slate-500 mono flex justify-between">
        <span>${items.length} items · refreshes every 10s</span>
        <span>${scannedAt ? `scanned ${new Date(scannedAt).toLocaleTimeString()}` : ''}</span>
      </footer>
    </div>
  `;
}

render(h(App), document.getElementById('app'));

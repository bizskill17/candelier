import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import Toggle from '../components/Toggle';
import { useAuth } from '../auth/AuthContext';
import SearchSelect from '../components/SearchSelect';
import { masters } from '../config/masters';
import { useToast } from '../components/Toast';
import MasterForm from '../components/MasterForm';
import ConfirmDialog from '../components/ConfirmDialog';

const PER_PAGE = 25;

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const fmtQty = (n) =>
  n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function MasterPage({ module }) {
  const entity = module.key;
  const def = masters[entity];
  const toast = useToast();
  const { canEdit } = useAuth();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('active');
  const [filterValue, setFilterValue] = useState('');
  const [filterOptions, setFilterOptions] = useState([]);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null); // null | 'new' | record
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = { q, status, page, per_page: PER_PAGE, sort: sort.key, dir: sort.dir };
      if (def.filter && filterValue) params[def.filter.name] = filterValue;
      const res = await api.list(entity, params);
      setRows(res.data);
      setTotal(res.total);
      setCounts(res.counts);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [entity, def, q, status, page, sort, filterValue]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, status, filterValue, sort]);

  useEffect(() => {
    if (!def.filter) return;
    api.lookup(def.filter.ref).then((r) => setFilterOptions(r.data)).catch(() => {});
  }, [def]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleActive = async (row) => {
    try {
      const res = await api.setStatus(entity, row.id, !row.is_active);
      toast(res.message);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.remove(entity, deleting.id);
      toast(res.message);
      setDeleting(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = q || filterValue;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {[
            ['active', `Active`, counts.active],
            ['inactive', `Inactive`, counts.inactive],
            ['all', 'All', counts.active + counts.inactive],
          ].map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                status === key ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label} <span className="tabular-nums text-gray-400">{n}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          {def.filter && (
            <SearchSelect
              id={`filter-${entity}`}
              className="w-full sm:w-56"
              options={[{ value: '', label: def.filter.label }, ...filterOptions.map((o) => ({ value: o.id, label: o.name }))]}
              value={filterValue}
              onChange={setFilterValue}
              placeholder={def.filter.label}
              clearable
            />
          )}
          {/* Search with the Add button on its right */}
          <div className="flex min-w-[240px] flex-1 gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <Search size={16} className="text-gray-400" />
              <input
                id={`search-${entity}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${def.plural}…`}
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </label>
            {canEdit && <button
              onClick={() => setEditing('new')}
              aria-label={`Add ${def.singular}`}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus size={16} /> Add
            </button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-blue-300 bg-white [&_th]:border-t-0 [&_tbody_tr:last-child_td]:border-b-0 [&_td:first-child]:border-l-0 [&_th:first-child]:border-l-0 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm" style={def.minWidth ? { minWidth: def.minWidth } : undefined}>
            <thead className="bg-brand-600 text-xs uppercase tracking-wide text-white">
              <tr>
                {def.columns.map((c) => (
                  <SortHeader
                    key={c.key}
                    sortKey={c.sort || c.key}
                    sort={sort}
                    onSort={toggleSort}
                    align={c.align}
                    className={`${c.width || ''} ${c.hideSm ? 'hidden md:table-cell' : ''}`}
                  >
                    {c.label}
                  </SortHeader>
                ))}
                <SortHeader sortKey="is_active" sort={sort} onSort={toggleSort} align="center" className="w-24">Status</SortHeader>
                <th className="w-24 border border-blue-400 px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={def.columns.length + 2} className="border border-blue-200 px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))}

              {!loading && loadError && (
                <tr>
                  <td colSpan={def.columns.length + 2} className="px-4 py-10 text-center">
                    <p className="text-sm text-red-600">{loadError}</p>
                    <button onClick={load} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
                      <RefreshCw size={14} /> Try again
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !loadError && rows.length === 0 && (
                <tr>
                  <td colSpan={def.columns.length + 2} className="px-4 py-14 text-center">
                    {filtered ? (
                      <p className="text-sm text-gray-500">No {def.plural} match your search.</p>
                    ) : status === 'inactive' ? (
                      <p className="text-sm text-gray-500">No inactive {def.plural}.</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900">No {def.plural} yet</p>
                        <button onClick={() => setEditing('new')} className="mt-2 text-sm font-medium text-brand-600 hover:underline">
                          Add your first {def.singular.toLowerCase()}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setEditing(row)}
                  className={`cursor-pointer hover:bg-gray-50 ${loading ? 'opacity-60' : ''}`}
                >
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border border-blue-200 px-4 py-3 align-top ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.hideSm ? 'hidden md:table-cell' : ''}`}
                    >
                      <Cell column={c} row={row} />
                    </td>
                  ))}
                  <td className="border border-blue-200 px-4 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    <Toggle
                      disabled={!canEdit}
                      checked={row.is_active}
                      onChange={() => toggleActive(row)}
                      label={row.is_active ? `Active. Click to deactivate ${row.name}` : `Inactive. Click to activate ${row.name}`}
                    />
                  </td>
                  <td className="border border-blue-200 px-4 py-2 text-center align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex gap-0.5">
                      <IconBtn title={canEdit ? 'Edit' : 'View'} onClick={() => setEditing(row)}><Pencil size={15} /></IconBtn>
                      {canEdit && <IconBtn title="Delete" danger onClick={() => setDeleting(row)}><Trash2 size={15} /></IconBtn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-blue-200 px-4 py-2.5 text-sm text-gray-600">
            <span className="tabular-nums">{from}–{to} of {total}</span>
            <div className="flex items-center gap-1">
              <IconBtn title="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></IconBtn>
              <span className="px-2 tabular-nums">Page {page} of {pages}</span>
              <IconBtn title="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></IconBtn>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <MasterForm
          entity={entity}
          def={def}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${def.singular}?`}
        message={deleting ? `“${deleting.name}”${def.hideCode ? '' : ` (${deleting.code})`} will be permanently removed. If it's already used elsewhere, deactivate it instead.` : ''}
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function Cell({ column: c, row }) {
  const v = row[c.key];
  if (c.datetime) {
    return v ? <span className="whitespace-nowrap tabular-nums">{v.slice(0, 10).split('-').reverse().join('-')} {v.slice(11, 16)}</span> : <span className="text-gray-300">Never</span>;
  }
  if (c.badge) {
    return v ? <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{v}</span> : null;
  }
  if (c.link) {
    return v ? (
      <a href={v} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
        {v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <ExternalLink size={12} />
      </a>
    ) : null;
  }
  if (c.qty) {
    return v === null || v === undefined ? <span className="text-gray-300">—</span> : (
      <span>{fmtQty(v)} <span className="text-gray-400">{row[c.unitKey]}</span></span>
    );
  }
  return (
    <div className="min-w-0">
      <div className={`${c.mono ? 'font-mono text-xs' : ''} ${c.strong ? 'font-medium text-gray-900' : ''} ${c.nowrap ? 'whitespace-nowrap' : ''}`}>
        {v || <span className="text-gray-300">—</span>}
      </div>
      {c.sub && row[c.sub] && <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{row[c.sub]}</div>}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger, disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 text-gray-500 disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function SortHeader({ sortKey, sort, onSort, align, className = '', children }) {
  const activeSort = sort.key === sortKey;
  const Icon = !activeSort ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={`border border-blue-400 p-0 font-semibold ${className}`}
      aria-sort={activeSort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${children}`}
        className={`flex min-h-[52px] w-full items-center gap-1 px-4 py-2 text-left uppercase tracking-wide hover:bg-brand-700 focus:outline-none focus-visible:bg-brand-700 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''
        }`}
      >
        {children}
        <Icon size={14} className={activeSort ? 'text-white' : 'text-white/50'} />
      </button>
    </th>
  );
}

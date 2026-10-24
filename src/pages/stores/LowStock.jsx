import Pagination, { usePagination } from '../../components/Pagination';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, RefreshCw } from 'lucide-react';
import { api, inventoryApi } from '../../api/client';
import { useCatalog } from '../../lib/catalog';
import SearchSelect from '../../components/SearchSelect';
import { tableWrap, theadCls, thCls, tdCls } from '../../components/table';
import { today, fmtDate, fmtQty } from '../../lib/util';

// Specifications whose Available to Book has fallen below their reorder level.
export default function LowStock() {
  const navigate = useNavigate();
  const cat = useCatalog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => { api.lookup('suppliers').then((r) => setSuppliers(r.data)).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { const r = await inventoryApi.lowStock({ material_id: materialId, supplier_id: supplierId }); setRows(r.data); } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }, [materialId, supplierId]);
  useEffect(() => { load(); }, [load]);
  const pagination = usePagination(rows, JSON.stringify([materialId, supplierId]));
  const cols = 8;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="print:hidden flex flex-wrap gap-2">
        <SearchSelect id="low-material" className="w-full sm:w-56" options={[{ value: '', label: 'All materials' }, ...cat.materials.map((m) => ({ value: m.id, label: m.name }))]} value={materialId} onChange={setMaterialId} placeholder="All materials" clearable />
        <SearchSelect id="low-supplier" className="w-full sm:w-56" options={[{ value: '', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} value={supplierId} onChange={setSupplierId} placeholder="All suppliers" clearable />
        <span className="flex-1" />
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Printer size={15} /> Print / PDF</button>
      </div>
      <div className="hidden print:block"><h1 className="text-xl font-semibold">Low Stock</h1><p className="text-sm text-gray-600">As on {fmtDate(today())}</p></div>
      <div className={tableWrap}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Material</th>
                <th className={`${thCls} w-16`}>Unit</th>
                <th className={`${thCls} w-24 text-right`}>In Stock</th>
                <th className={`${thCls} w-24 text-right`}>Booked</th>
                <th className={`${thCls} w-28 text-right`}>Available to Book</th>
                <th className={`${thCls} w-28 text-right`}>Reorder Level</th>
                <th className={`${thCls} w-24 text-right`}>Short By</th>
                <th className={thCls}>Last Supplier</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [1, 2].map((i) => <tr key={i}><td colSpan={cols} className={tdCls}><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)}
              {!loading && loadError && <tr><td colSpan={cols} className={`${tdCls} py-10 text-center`}><p className="text-red-600">{loadError}</p><button onClick={load} className="mt-2 inline-flex items-center gap-1 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button></td></tr>}
              {!loading && !loadError && rows.length === 0 && <tr><td colSpan={cols} className={`${tdCls} py-14 text-center text-gray-500`}>Nothing is below its reorder level. Set reorder levels in Inventory.</td></tr>}
              {pagination.rows.map((r) => (
                <tr key={r.id}>
                  <td className={tdCls}><b className="text-gray-900">{r.material_name}</b>{r.spec_text && <span className="text-gray-700"> · {r.spec_text}</span>}</td>
                  <td className={tdCls}>{r.unit}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(r.in_stock)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(r.booked)}</td>
                  <td className={`${tdCls} text-right font-semibold tabular-nums text-red-600`}>{fmtQty(r.available)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtQty(r.reorder_level)}</td>
                  <td className={`${tdCls} text-right font-semibold tabular-nums text-gray-900`}>{fmtQty(r.short_by)}</td>
                  <td className={tdCls}>{r.last_supplier || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>
      {rows.length > 0 && <div className="print:hidden flex justify-end"><button onClick={() => navigate('/material-in/new')} className="text-sm font-medium text-brand-600 hover:underline">Record Material In →</button></div>}
    </div>
  );
}

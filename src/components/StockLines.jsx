import { Plus, Trash2, Copy } from 'lucide-react';
import SearchSelect from './SearchSelect';
import AutoTextarea from './AutoTextarea';
import DateInput from './DateInput';
import { SpecCell } from './Spec';
import { inputCls } from './table';
import { useCatalog } from '../lib/catalog';
import { today } from '../lib/util';

let seq = 0;
export const blankStockLine = (extra = {}) => ({ key: ++seq, material_id: '', values: {}, quantity: '', remarks: '', ...extra });
export const toStockLines = (rows, extra = {}) => (rows?.length ? rows.map((r) => ({ key: ++seq, remarks: '', ...extra, ...r, values: { ...(r.values || {}) } })) : [blankStockLine(extra)]);

export const DAMAGE_REASONS = ['Broken', 'Defective', 'Lost', 'Other'];

// Lines of material + specification + quantity, used by Opening Stock, Material In, Material Issue and Damage.
//   infoColumns: [{ label, render: (line) => node }]  read-only columns before Quantity
export default function StockLines({ title = 'Materials', lines, onChange, errors = {}, readOnly, infoColumns = [], showDate, showReason, orderItemId, emptyHint }) {
  const cat = useCatalog();
  const filled = lines.filter((l) => l.material_id).length;
  const setLine = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const extra = () => ({ ...(showDate ? { entry_date: today() } : {}), ...(showReason ? { reason: 'Broken' } : {}) });
  const addAfter = (idx, copy) => {
    const base = copy ? { ...lines[idx], values: { ...lines[idx].values }, quantity: '', id: undefined } : extra();
    onChange([...lines.slice(0, idx + 1), blankStockLine(base), ...lines.slice(idx + 1)]);
  };
  const remove = (idx) => onChange(lines.length === 1 ? [blankStockLine(extra())] : lines.filter((_, i) => i !== idx));
  const matOptions = cat.materials.filter((m) => m.is_active || lines.some((l) => String(l.material_id) === String(m.id))).map((m) => ({ value: m.id, label: m.name, hint: m.unit }));

  const th = 'border border-blue-400 px-3 py-2 text-left font-semibold';
  const td = 'border border-blue-200 px-2 py-2 align-top';
  const err = (idx, k) => errors[`lines.${idx}.${k}`];
  const minW = 760 + infoColumns.length * 90 + (showDate ? 140 : 0) + (showReason ? 120 : 0);

  return (
    <section className="overflow-hidden rounded-xl border border-blue-300 bg-white">
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{filled} {filled === 1 ? 'line' : 'lines'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: minW }}>
          <thead className="bg-brand-600 text-xs uppercase tracking-wide text-white">
            <tr>
              <th className={`${th} w-10 border-l-0 text-center`}>#</th>
              {showDate && <th className={`${th} w-36`}>Date</th>}
              <th className={`${th} w-44`}>Material</th>
              <th className={th}>Specification</th>
              {infoColumns.map((c) => <th key={c.label} className={`${th} w-[5.5rem] text-right`}>{c.label}</th>)}
              <th className={`${th} w-28 text-right`}>Quantity</th>
              <th className={`${th} w-16`}>Unit</th>
              {showReason && <th className={`${th} w-32`}>Reason</th>}
              <th className={`${th} w-[16%]`}>Remarks</th>
              {!readOnly && <th className={`${th} w-24 border-r-0 text-center`}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const m = cat.material(l.material_id);
              return (
                <tr key={l.key}>
                  <td className={`${td} border-l-0 py-3 text-center tabular-nums text-gray-500`}>{idx + 1}</td>
                  {showDate && (
                    <td className={td}>
                      <DateInput compact aria-label={`Date, line ${idx + 1}`} max={today()} value={l.entry_date || ''} onChange={(v) => setLine(idx, { entry_date: v })} error={err(idx, 'entry_date')} disabled={readOnly} />
                      {err(idx, 'entry_date') && <p className="mt-1 text-xs text-red-600">{err(idx, 'entry_date')}</p>}
                    </td>
                  )}
                  <td className={td}>
                    {readOnly ? <div className="px-1 py-1.5 font-medium text-gray-900">{m?.name || l.material_name}</div> : (
                      <SearchSelect
                        id={`line-${idx}-material`}
                        aria-label={`Material, line ${idx + 1}`}
                        options={matOptions}
                        value={l.material_id}
                        onChange={(v) => setLine(idx, { material_id: v, values: String(v) === String(l.material_id) ? l.values : {} })}
                        error={err(idx, 'material_id')}
                        disabled={!cat.loaded}
                        placeholder={cat.loaded ? 'Select material' : 'Loading…'}
                      />
                    )}
                    {err(idx, 'material_id') && <p className="mt-1 text-xs text-red-600">{err(idx, 'material_id')}</p>}
                  </td>
                  <td className={td}>
                    <SpecCell id={`line-${idx}-spec`} materialId={l.material_id} values={l.values} onChange={(v) => setLine(idx, { values: v })} readOnly={readOnly} error={err(idx, 'values')} orderItemId={orderItemId} />
                    {err(idx, 'values') && <p className="mt-1 text-xs text-red-600">{err(idx, 'values')}</p>}
                  </td>
                  {infoColumns.map((c) => <td key={c.label} className={`${td} px-3 py-3 text-right tabular-nums`}>{c.render(l)}</td>)}
                  <td className={td}>
                    {readOnly ? <span className="block px-1 py-1.5 text-right tabular-nums">{l.quantity}</span> : (
                      <input id={`line-${idx}-qty`} aria-label={`Quantity, line ${idx + 1}`} type="number" min="0" step="any" inputMode="decimal"
                        value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className={`${inputCls(err(idx, 'quantity'))} text-right tabular-nums`} />
                    )}
                    {err(idx, 'quantity') && <p className="mt-1 text-xs text-red-600">{err(idx, 'quantity')}</p>}
                  </td>
                  <td className={`${td} px-3 py-3 text-gray-700`}>{m?.unit || l.unit || <span className="text-gray-300">—</span>}</td>
                  {showReason && (
                    <td className={td}>
                      {readOnly ? <span className="block px-1 py-1.5">{l.reason}</span> : (
                        <select aria-label={`Reason, line ${idx + 1}`} value={l.reason || 'Broken'} onChange={(e) => setLine(idx, { reason: e.target.value })} className={inputCls(err(idx, 'reason'))}>
                          {DAMAGE_REASONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  <td className={td}>
                    {readOnly ? <span className="block whitespace-pre-wrap break-words px-1 py-1.5 text-gray-600">{l.remarks}</span> : (
                      <AutoTextarea aria-label={`Remarks, line ${idx + 1}`} value={l.remarks || ''} onChange={(v) => setLine(idx, { remarks: v })} className={inputCls()} />
                    )}
                  </td>
                  {!readOnly && (
                    <td className={`${td} border-r-0 px-1 py-2.5 text-center`}>
                      <div className="inline-flex gap-0.5">
                        <button type="button" onClick={() => addAfter(idx)} title="Add line below" aria-label={`Add line below line ${idx + 1}`} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>
                        <button type="button" onClick={() => addAfter(idx, true)} title="Copy this material to a new line" aria-label={`Copy line ${idx + 1}`} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><Copy size={14} /></button>
                        <button type="button" onClick={() => remove(idx)} title="Remove line" aria-label={`Remove line ${idx + 1}`} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(errors.lines || emptyHint) && (
        <div className="border-t border-blue-200 px-5 py-3 text-sm">
          {errors.lines ? <p className="text-red-600">{errors.lines}</p> : <p className="text-xs text-gray-500">{emptyHint}</p>}
        </div>
      )}
    </section>
  );
}

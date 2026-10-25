import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Copy, RefreshCw, X, ClipboardList, Truck } from 'lucide-react';
import { api, ordersApi, crmApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import SearchSelect from '../../components/SearchSelect';
import DateInput from '../../components/DateInput';
import AutoTextarea from '../../components/AutoTextarea';
import ItemSpecCell from '../../components/ItemSpec';
import { PhotoSlot } from '../../components/Photo';
import { useItemFields } from '../../lib/items';
import ConfirmDialog from '../../components/ConfirmDialog';
import { inputCls } from '../../components/table';
import { today, OrderStatus, ItemStage, fmtDate } from '../../lib/util';
import DispatchDialog from './DispatchDialog';
import { ContactForm } from '../crm/CrmShared';
import { masters } from '../../config/masters';

let seq = 0;
const blankItem = (extra = {}) => ({ key: ++seq, id: null, area: '', values: {}, remarks: '', component_image: '', reference_image: '', drawing_file: '', drawing_name: '', ...extra });
const blankOrder = (userId) => ({ customer_id: '', project_name: '', order_date: today(), delivery_date: '', order_by_id: userId || '', shipping_address: '' });
const cleanValues = (v) => Object.fromEntries(Object.entries(v || {}).map(([k, x]) => [k, String(x ?? '').trim()]).filter(([, x]) => x));
const itemBody = ({ id, area, values, remarks, component_image, reference_image, drawing_file, drawing_name }) => ({ id, area: (area || '').trim(), values: cleanValues(values), remarks: remarks || '', component_image: component_image || '', reference_image: reference_image || '', drawing_file: drawing_file || '', drawing_name: drawing_file ? drawing_name || '' : '' });
const snapshot = (h, items) => JSON.stringify({ h, items: items.map(itemBody) });
const isBlank = (it) => !it.id && !(it.area || '').trim() && !Object.keys(cleanValues(it.values)).length && !it.remarks && !it.component_image && !it.reference_image && !it.drawing_file;

// Add Order (new) or one order (edit). Each order item is exactly one piece.
export default function OrderForm({ id, leadId }) {
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { canEdit, canCreateSales, canCreateStock, user } = useAuth();
  const [order, setOrder] = useState(null);
  const [header, setHeader] = useState(() => blankOrder(user?.id));
  const [items, setItems] = useState(() => [blankItem()]);
  const [saved, setSaved] = useState('');
  const [customers, setCustomers] = useState(null);
  const itemFields = useItemFields();
  const [users, setUsers] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [dispatching, setDispatching] = useState(null);
  const [fromLead, setFromLead] = useState(null);
  const [customerOpen, setCustomerOpen] = useState(false);

  useEffect(() => {
    const loadCustomers = () => api.lookup('customers').then((r) => setCustomers(r.data)).catch(() => setCustomers([]));
    if (leadId && !id) {
      // Orders select the existing Contact; no duplicate customer record is created.
      crmApi.customer(leadId).then((r) => {
        if (r.message) toast(r.message);
        const { lead, customer } = r.data;
        setFromLead(lead);
        setHeader((h) => ({ ...h, customer_id: customer.id, shipping_address: customer.address || h.shipping_address, project_name: h.project_name || lead.project_name || '' }));
        loadCustomers();
      }).catch((e) => { setFormError(e.message); loadCustomers(); });
    } else loadCustomers();
    ordersApi.users().then((r) => setUsers(r.data)).catch(() => setUsers([]));
  }, []);

  const fill = (o) => {
    setOrder(o);
    const h = { customer_id: o.customer_id, project_name: o.project_name || '', order_date: o.order_date, delivery_date: o.delivery_date || '', order_by_id: o.order_by_id || '', shipping_address: o.shipping_address || '' };
    const its = o.items.map((i) => ({ key: ++seq, id: i.id, area: i.area || '', values: { ...(i.values || {}) }, remarks: i.remarks || '', component_image: i.component_image || '', reference_image: i.reference_image || '', drawing_file: i.drawing_file || '', drawing_name: i.drawing_name || '' }));
    setHeader(h);
    setItems(its);
    setSaved(snapshot(h, its));
  };
  const load = () => { setLoadError(''); ordersApi.get(id).then((r) => fill(r.data)).catch((e) => setLoadError(e.message)); };
  useEffect(() => { if (isEdit) load(); else setSaved(snapshot(blankOrder(user?.id), [])); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = isEdit && saved !== snapshot(header, items);
  const setH = (k, v) => { setHeader((h) => ({ ...h, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
  const pickCustomer = (v) => {
    setH('customer_id', v);
    const c = (customers || []).find((x) => String(x.id) === String(v));
    if (c && !header.shipping_address) setH('shipping_address', c.address || '');
  };
  const setItem = (i, k, v) => { setItems((its) => its.map((it, j) => (j === i ? { ...it, [k]: v } : it))); setErrors((e) => ({ ...e, [`items.${i}.${k}`]: undefined, items: undefined })); };
  const addAfter = (i, copy) => setItems((its) => [...its.slice(0, i + 1), blankItem(copy ? { area: its[i].area, values: { ...its[i].values }, remarks: its[i].remarks, component_image: its[i].component_image, reference_image: its[i].reference_image, drawing_file: its[i].drawing_file, drawing_name: its[i].drawing_name } : {}), ...its.slice(i + 1)]);
  const removeItem = (i) => setItems((its) => (its.length === 1 ? [blankItem()] : its.filter((_, j) => j !== i)));

  const clear = () => { setHeader(blankOrder(user?.id)); setItems([blankItem()]); setErrors({}); setFormError(''); };
  const back = () => navigate('/orders/all');

  const save = async (e) => {
    e?.preventDefault();
    if (!header.delivery_date) { setErrors((prev) => ({ ...prev, delivery_date: 'Enter the target delivery date.' })); return; }
    setSaving(true);
    setFormError('');
    const body = { ...header, items: items.map(itemBody), lead_id: !isEdit && fromLead ? fromLead.id : undefined };
    try {
      const r = isEdit ? await ordersApi.update(id, body) : await ordersApi.create(body);
      toast(r.message);
      if (isEdit) fill(r.data); else navigate('/orders/all');
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.fields?.lead_id || err.message);
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } finally { setSaving(false); }
  };
  const setStatus = async (s) => {
    try { const r = await ordersApi.setStatus(id, s); toast(r.message); fill(r.data); } catch (err) { toast(err.message, 'error'); }
    setConfirm(null);
  };
  const doDelete = async () => {
    try { const r = await ordersApi.remove(id); toast(r.message); back(); } catch (err) { toast(err.message, 'error'); setConfirm(null); }
  };

  const savedItem = useMemo(() => {
    const m = {};
    (order?.items || []).forEach((i) => { m[i.id] = i; });
    return m;
  }, [order]);

  if (isEdit && loadError) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <div className="mt-3 flex justify-center gap-4 text-sm font-medium">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline"><RefreshCw size={14} /> Try again</button>
          <button onClick={back} className="text-gray-600 hover:underline">Back to orders</button>
        </div>
      </div>
    );
  }
  if (isEdit && !order) return <div className="mx-auto max-w-5xl space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  const cancelled = order?.status === 'Cancelled';
  const canWrite=canEdit||(!isEdit&&canCreateSales);
  const locked = !canWrite || cancelled;
  const custOpts = (customers || []).filter((c) => c.is_active || String(c.id) === String(header.customer_id)).map((c) => ({ value: c.id, label: [c.name, c.city, c.mobile || c.phone].filter(Boolean).join(' · ') }));
  const fieldsFor = (it) => itemFields.fields.filter((f) => f.is_active || (it.values?.[f.id] ?? '') !== '');
  const th = 'border border-blue-400 px-3 py-2 text-left font-semibold';
  const td = 'border border-blue-200 px-2 py-2 align-top';
  const userOpts = (users || []).filter((u) => u.is_active || String(u.id) === String(header.order_by_id)).map((u) => ({ value: u.id, label: u.name }));

  return (
    <>
    <form onSubmit={save} noValidate className="mx-auto max-w-6xl space-y-4 pb-24">
      {isEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={back} className="inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ChevronLeft size={16} /> Orders</button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">Order {order.order_no}</h2>
          {order.lead && <button type="button" onClick={() => navigate(`/leads/${order.lead.id}`)} className="text-xs font-medium text-brand-600 hover:underline">From lead {order.lead.lead_no}</button>}
          <OrderStatus status={order.status} />
        </div>
      )}
      {!isEdit && fromLead && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          Order for lead <b>{fromLead.lead_no}</b> · {fromLead.display_name}{fromLead.requirement ? ` · ${fromLead.requirement}` : ''}
          <span className="flex-1" />
          <button type="button" onClick={() => navigate(`/leads/${fromLead.id}`)} className="font-medium text-green-700 hover:underline">Back to lead</button>
        </div>
      )}
      {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

      <div className="space-y-4">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Order Date" required htmlFor="o-date" error={errors.order_date}>
              <DateInput id="o-date" value={header.order_date} onChange={(v) => setH('order_date', v)} error={errors.order_date} disabled={locked} />
            </Field>
            <Field label="Order By" htmlFor="o-by" error={errors.order_by_id}>
              <SearchSelect id="o-by" options={userOpts} value={header.order_by_id} onChange={(v) => setH('order_by_id', v)} disabled={locked || !users || user?.role!=='Admin'} placeholder="Select user" clearable />
            </Field>
            <Field label="Customer" required htmlFor="o-customer" error={errors.customer_id} className="sm:col-span-2">
              <div className="flex gap-1.5">
                <SearchSelect id="o-customer" className="min-w-0 flex-1" options={custOpts} value={header.customer_id} onChange={pickCustomer} error={errors.customer_id} disabled={locked || !customers} placeholder={customers ? 'Select customer' : 'Loading…'} />
                {!locked && <button type="button" onClick={() => setCustomerOpen(true)} title="Add a new contact" aria-label="Add a new contact" className="shrink-0 rounded-lg border border-gray-300 bg-white px-2.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>}
              </div>
            </Field>
            <Field label="Project Name" htmlFor="o-project" error={errors.project_name} className="sm:col-span-2">
              <input id="o-project" disabled={locked} value={header.project_name} onChange={(e) => setH('project_name', e.target.value)} className={inputCls(errors.project_name)} placeholder="e.g. Residence of Mr. Bhatiya" />
            </Field>
            <Field label="Target Delivery Date" required htmlFor="o-delivery" error={errors.delivery_date}>
              <DateInput id="o-delivery" min={header.order_date} value={header.delivery_date} onChange={(v) => setH('delivery_date', v)} error={errors.delivery_date} disabled={locked} />
            </Field>
            <Field label="Shipping Address" htmlFor="o-address" error={errors.shipping_address} className="sm:col-span-2 lg:col-span-4">
              <textarea id="o-address" rows={1} disabled={locked} value={header.shipping_address} onChange={(e) => setH('shipping_address', e.target.value)} className={inputCls(errors.shipping_address)} placeholder="Filled from the customer" />
            </Field>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-blue-300 bg-white">
          <div className="flex items-center justify-between px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Order Items</h3>
            <span className="text-xs text-gray-500">Each item is one piece · {items.filter((it) => !isBlank(it)).length} items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: isEdit ? 1500 : 920 }}>
              <thead className="bg-brand-600 text-xs uppercase tracking-wide text-white">
                <tr>
                  <th className={`${th} w-10 border-l-0 text-center`}>#</th>
                  <th className={`${th} ${isEdit ? 'w-48' : 'w-[20%]'}`}>Area</th>
                  <th className={th}>Order Item</th>
                  <th className={`${th} ${isEdit ? 'w-60' : 'w-[26%]'}`}>Remarks</th>
                  <th className={`${th} w-32`}>Reference Image</th>
                  {isEdit && <th className={`${th} w-28`}>Stage</th>}
                  {isEdit && <th className={`${th} w-[10.5rem] text-center`}>BOQ / Dispatch</th>}
                  {!locked && <th className={`${th} w-24 border-r-0 text-center`}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const s = it.id ? savedItem[it.id] : null;
                  const n = i + 1;
                  return (
                    <tr key={it.key}>
                      <td className={`${td} border-l-0 py-3 text-center tabular-nums text-gray-500`}>{n}</td>
                      <td className={td}><AutoTextarea aria-label={`Area, item ${n}`} disabled={locked} value={it.area} onChange={(v) => setItem(i, 'area', v.replace(/\n/g, ' '))} placeholder="e.g. Dining" className={inputCls(errors[`items.${i}.area`])} /></td>
                      <td className={td}>
                        <ItemSpecCell id={`o-item-${i}-spec`} title={`Order item ${n}`} fields={fieldsFor(it)} values={it.values} onChange={(v) => setItem(i, 'values', v)} readOnly={locked} error={errors[`items.${i}.values`]} />
                        {errors[`items.${i}.values`] && <p className="mt-1 text-xs text-red-600">{errors[`items.${i}.values`]}</p>}
                      </td>
                      <td className={td}><AutoTextarea aria-label={`Remarks, item ${n}`} disabled={locked} value={it.remarks} onChange={(v) => setItem(i, 'remarks', v)} placeholder="e.g. Hang height 14 ft" className={inputCls(errors[`items.${i}.remarks`])} /></td>
                      <td className={td}>
                        <PhotoSlot id={`o-item-${i}-reference`} label="Reference Image" value={it.reference_image} onChange={(v) => setItem(i, 'reference_image', v)} disabled={locked} error={errors[`items.${i}.reference_image`]} />
                      </td>
                      {isEdit && <td className={`${td} px-3 py-3`}>{s ? <><ItemStage stage={s.stage} />{s.dispatch && <div className="mt-1 text-xs text-gray-500">{fmtDate(s.dispatch.dispatch_date)}</div>}</> : <span className="text-xs text-gray-400">New</span>}</td>}
                      {isEdit && (
                        <td className={`${td} py-2.5 text-center`}>
                          {s ? (
                            <div className="inline-flex gap-1.5" title={dirty ? 'Save your changes first' : undefined}>
                              <button type="button" disabled={dirty} onClick={() => navigate(`/boq/${s.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"><ClipboardList size={13} /> BOQ · {s.boq_status}</button>
                              {canCreateStock && (canEdit || (!s.dispatch&&s.production_status==='Complete')) && !cancelled && <button type="button" disabled={dirty} onClick={() => setDispatching(s)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${s.dispatch ? 'text-brand-600 hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700'}`}><Truck size={13} /> {s.dispatch ? 'Dispatched' : 'Dispatch'}</button>}
                            </div>
                          ) : <span className="text-xs text-gray-400">Save first</span>}
                        </td>
                      )}
                      {!locked && (
                        <td className={`${td} border-r-0 px-1 py-2.5 text-center`}>
                          <div className="inline-flex gap-0.5">
                            <button type="button" onClick={() => addAfter(i)} title="Add item below" aria-label={`Add item below item ${n}`} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50"><Plus size={16} /></button>
                            <button type="button" onClick={() => addAfter(i, true)} title="Duplicate this item" aria-label={`Duplicate item ${n}`} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><Copy size={14} /></button>
                            <button type="button" onClick={() => removeItem(i)} title="Remove item" aria-label={`Remove item ${n}`} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {itemFields.loaded && itemFields.fields.length === 0 && <p className="border-t border-blue-200 px-5 py-3 text-xs text-gray-500">Add your item fields (Size, Glass Colour…) in Orders → Order Item Fields.</p>}
          {errors.items && <div className="border-t border-blue-200 px-5 py-3 text-sm text-red-600">{errors.items}</div>}
        </section>
      </div>

      {canWrite && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          {isEdit && !cancelled && order.dispatched_count === 0 && <button type="button" onClick={() => setConfirm('cancel')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><X size={15} /> Cancel order</button>}
          {isEdit && cancelled && <button type="button" onClick={() => setStatus('Reopen')} className="rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">Reopen order</button>}
          {isEdit && order.dispatched_count === 0 && <button type="button" onClick={() => setConfirm('delete')} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={15} /> Delete</button>}
          <div className="flex-1" />
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button type="button" onClick={isEdit ? back : clear} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">{isEdit ? 'Back' : 'Clear'}</button>
          {!cancelled && <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Order'}</button>}
        </div>
      )}

      <ConfirmDialog open={confirm === 'cancel'} title="Cancel this order?" message="Its bookings will stop holding stock. You can reopen it later." confirmLabel="Cancel order" onConfirm={() => setStatus('Cancelled')} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'delete'} title="Delete this order?" message={isEdit ? `${order.order_no} and its BOQs will be removed. Orders with bookings or issues can only be cancelled.` : ''} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
      {dispatching && <DispatchDialog item={dispatching} label={`${order.order_no} · #${dispatching.line_no} ${dispatching.item_title}`} onClose={() => setDispatching(null)} onDone={(o) => { setDispatching(null); fill(o); }} />}
    </form>
    {customerOpen && !locked && <ContactForm
      onClose={() => setCustomerOpen(false)}
      onSaved={(customer) => {
        setCustomers((list) => [...(list || []).filter((c) => c.id !== customer.id), customer].sort((a, b) => a.name.localeCompare(b.name)));
        setH('customer_id', customer.id);
        setHeader((h) => ({ ...h, shipping_address: h.shipping_address || customer.address || '' }));
      }} />}
    </>
  );
}

function Field({ label, htmlFor, required, error, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

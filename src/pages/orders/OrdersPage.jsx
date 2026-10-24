import { useLocation } from 'react-router-dom';
import OrderList from './OrderList';
import OrderForm from './OrderForm';

// /orders/new    Add Order (only the form; clears after saving)
// /orders/all    Order Master
// /orders/{id}   one order: header, items, BOQ, production date, dispatch
export default function OrdersPage() {
  const { pathname } = useLocation();
  const sub = pathname.replace(/^\/orders\/?/, '').split('/')[0];
  if (sub === 'new') {
    const parts = pathname.split('/');
    const leadId = parts[3] === 'lead' ? Number(parts[4]) || null : null;
    return <OrderForm key={`new-${leadId || ''}`} leadId={leadId} />;
  }
  if (/^\d+$/.test(sub)) return <OrderForm key={sub} id={Number(sub)} />;
  const week = pathname.replace(/^\/orders\/?/, '').split('/')[1] === 'week';
  return <OrderList key={week ? 'week' : 'all'} week={week} />;
}

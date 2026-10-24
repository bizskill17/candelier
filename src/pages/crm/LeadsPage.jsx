import { useLocation } from 'react-router-dom';
import LeadList from './LeadList';
import LeadForm from './LeadForm';

// /leads        Leads
// /leads/new    Add Lead
// /leads/{id}   one lead with its follow-ups
export default function LeadsPage() {
  const { pathname } = useLocation();
  const sub = pathname.replace(/^\/leads\/?/, '').split('/')[0];
  if (sub === 'new') return <LeadForm key="new" />;
  if (/^\d+$/.test(sub)) return <LeadForm key={sub} id={Number(sub)} />;
  return <LeadList />;
}

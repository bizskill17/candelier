import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MasterPage from './pages/MasterPage';
import NotFound from './pages/NotFound';
import MaterialsPage from './pages/materials/MaterialsPage';
import ItemFieldsPage from './pages/materials/ItemFieldsPage';
import OrdersPage from './pages/orders/OrdersPage';
import BoqPage from './pages/boq/BoqPage';
import BoqMaster from './pages/boq/BoqMaster';
import DispatchList from './pages/orders/DispatchList';
import PendingBoq from './pages/orders/PendingBoq';
import ProductionPage from './pages/orders/ProductionPage';
import DocsPage from './pages/stores/DocsPage';
import OpeningStock from './pages/stores/OpeningStock';
import InventoryPage from './pages/stores/InventoryPage';
import LowStock from './pages/stores/LowStock';
import LeadsPage from './pages/crm/LeadsPage';
import ContactsPage from './pages/crm/ContactsPage';
import FollowUps from './pages/crm/FollowUps';
import FollowUpLogs from './pages/crm/FollowUpLogs';
import { menu } from './config/menu';
import { useAuth } from './auth/AuthContext';
import { CatalogProvider } from './lib/catalog';

const mod = (key) => menu.flatMap((g) => g.items).find((i) => i.key === key);

export default function App() {
  const { isAdmin } = useAuth();
  return (
    <CatalogProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="contacts/*" element={<ContactsPage />} />
          <Route path="customers" element={<ContactsPage customers />} />
          <Route path="leads/*" element={<LeadsPage />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="followup-logs" element={<FollowUpLogs />} />
          <Route path="orders/*" element={<OrdersPage />} />
          <Route path="boq-master" element={<BoqMaster />} />
          <Route path="boq/*" element={<BoqPage />} />
          <Route path="production-in-progress" element={<ProductionPage key="in-progress" status="In Progress" />} />
          <Route path="ready-to-dispatch" element={<ProductionPage key="complete" status="Complete" />} />
          <Route path="dispatches" element={<DispatchList />} />
          <Route path="pending-boq" element={<PendingBoq />} />
          <Route path="opening-stock" element={<OpeningStock />} />
          <Route path="material-in/*" element={<DocsPage key="material-in" type="material-in" />} />
          <Route path="material-issue/*" element={<DocsPage key="material-issue" type="material-issue" />} />
          <Route path="damage/*" element={<DocsPage key="damage" type="damage" />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="low-stock" element={<LowStock />} />
          <Route path="material-categories" element={<MasterPage key="material_categories" module={mod('material_categories')} />} />
          <Route path="materials" element={<MaterialsPage />} />
          <Route path="item-fields" element={<ItemFieldsPage />} />
          {['suppliers', 'transporters'].map((k) => (
            <Route key={k} path={k} element={<MasterPage key={k} module={mod(k)} />} />
          ))}
          <Route path="lead-sources" element={<MasterPage key="lead_sources" module={mod('lead_sources')} />} />
          <Route path="client-categories" element={<MasterPage key="client_categories" module={mod('client_categories')} />} />
          <Route path="states" element={<MasterPage key="states" module={mod('states')} />} />
          <Route path="users" element={isAdmin ? <MasterPage key="users" module={mod('users')} /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </CatalogProvider>
  );
}

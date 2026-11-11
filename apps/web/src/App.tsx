import { Navigate, Route, Routes } from 'react-router-dom';
import { Guard, Shell } from './components/Shell';
import { firstRoute } from './lib/access';
import { getStoredUser } from './lib/api';
import { CashPage } from './pages/CashPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { IntakePage } from './pages/IntakePage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { PayrollPage } from './pages/PayrollPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route index element={<HomeRedirect />} />
        <Route path="/panel" element={<Guard section="panel"><DashboardPage /></Guard>} />
        <Route path="/ventas" element={<Guard section="ventas"><PosPage /></Guard>} />
        <Route path="/ordenes" element={<Guard section="ordenes"><OrdersPage /></Guard>} />
        <Route path="/caja" element={<Guard section="caja"><CashPage /></Guard>} />
        <Route path="/reportes" element={<Guard section="reportes"><ReportsPage /></Guard>} />
        <Route path="/planilla" element={<Guard section="planilla"><PayrollPage /></Guard>} />
        <Route path="/clientes" element={<Guard section="clientes"><CustomersPage /></Guard>} />
        <Route path="/ajustes" element={<Guard section="ajustes"><SettingsPage /></Guard>} />
        <Route path="/productos" element={<Guard section="productos"><ProductsPage /></Guard>} />
        <Route path="/servicios" element={<Guard section="servicios"><ServicesPage /></Guard>} />
        <Route path="/ingresos" element={<Guard section="ingresos"><IntakePage /></Guard>} />
        <Route path="/inventario" element={<Guard section="inventario"><InventoryPage /></Guard>} />
        <Route path="/proveedores" element={<Guard section="proveedores"><SuppliersPage /></Guard>} />
        <Route path="/usuarios" element={<Guard section="usuarios"><UsersPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeRedirect() {
  const user = getStoredUser();
  return <Navigate to={firstRoute(user) || '/login'} replace />;
}

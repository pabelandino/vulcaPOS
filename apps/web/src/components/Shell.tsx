import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { canAccess, firstRoute, SectionId } from '../lib/access';
import { api, clearSession, getStoredUser, getToken, saveSession, SessionUser } from '../lib/api';
import { flushOutbox, listPending } from '../lib/offline';
import { ConnectQr } from './ConnectQr';
import { Icon, IconName } from './icons';
import { useToasts } from './Toasts';
import { Modal } from './ui';

const NAV: Array<{ id: SectionId; to: string; label: string; icon: IconName }> = [
  { id: 'panel', to: '/panel', label: 'Panel', icon: 'panel' },
  { id: 'ventas', to: '/ventas', label: 'Ventas', icon: 'sales' },
  { id: 'ordenes', to: '/ordenes', label: 'Órdenes', icon: 'orders' },
  { id: 'caja', to: '/caja', label: 'Caja', icon: 'cash' },
  { id: 'reportes', to: '/reportes', label: 'Reportes', icon: 'reports' },
  { id: 'planilla', to: '/planilla', label: 'Planilla', icon: 'payroll' },
  { id: 'ingresos', to: '/ingresos', label: 'Ingresos', icon: 'intake' },
  { id: 'productos', to: '/productos', label: 'Productos', icon: 'products' },
  { id: 'servicios', to: '/servicios', label: 'Servicios', icon: 'services' },
  { id: 'inventario', to: '/inventario', label: 'Inventario', icon: 'inventory' },
  { id: 'clientes', to: '/clientes', label: 'Clientes', icon: 'customers' },
  { id: 'proveedores', to: '/proveedores', label: 'Proveedores', icon: 'suppliers' },
  { id: 'usuarios', to: '/usuarios', label: 'Usuarios', icon: 'customers' },
  { id: 'ajustes', to: '/ajustes', label: 'Ajustes', icon: 'settings' },
];

export function Shell() {
  const [user, setUser] = useState<SessionUser | null>(getStoredUser());
  const navigate = useNavigate();
  const toasts = useToasts();
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [install, setInstall] = useState<BeforeInstallPrompt | null>(null);
  const [qr, setQr] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstall(event as BeforeInstallPrompt);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    void sync();
    const token = getToken();
    if (token) {
      api<SessionUser>('/api/auth/me')
        .then((fresh) => {
          saveSession(token, fresh);
          setUser(fresh);
        })
        .catch(() => undefined);
    }
    const timer = window.setInterval(() => void sync(), 20000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.clearInterval(timer);
    };
  }, []);

  async function sync() {
    const result = await flushOutbox().catch(() => null);
    const items = await listPending().catch(() => []);
    setPending(items.length);
    const failed = items.find((item) => item.error);
    if (result?.synced) toasts.ok(`Se sincronizaron ${result.synced} operaciones pendientes.`);
    if (failed?.error) toasts.err(failed.error);
  }

  if (!user) return <Navigate to="/login" replace />;
  const links = NAV.filter((item) => canAccess(user, item.id));
  const preferred = ['/ventas', '/ordenes', '/caja', '/reportes'];
  const mobile = [...links.filter((item) => preferred.includes(item.to)), ...links.filter((item) => !preferred.includes(item.to))].slice(0, 4);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden bg-ink text-white lg:flex lg:min-h-screen lg:flex-col lg:px-4 lg:py-6">
        <Brand onDark />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {links.map((item) => (
            <SideLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </nav>
        <UserBox user={user} onLogout={() => { clearSession(); navigate('/login'); }} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white lg:bg-canvas lg:px-6 lg:text-ink">
          <div className="lg:hidden">
            <Brand compact onDark />
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-sm font-black text-white">{initials(user.name)}</span>
            <div>
              <p className="text-sm text-muted">Hola</p>
              <p className="font-bold text-ink">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!online ? <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-ink">Sin conexión{pending ? ` · ${pending}` : ''}</span> : null}
            {online && pending ? <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white lg:bg-ink lg:text-white">{pending} por sincronizar</span> : null}
            <button className="grid h-11 w-11 place-items-center rounded-full bg-lime text-ink" type="button" onClick={() => setQr(true)} aria-label="Conectar teléfono">
              <Icon name="phone" />
            </button>
            {install ? (
              <button className="min-h-11 rounded-full bg-lime px-3 text-sm font-bold text-ink" type="button" onClick={() => void install.prompt()}>
                Instalar app
              </button>
            ) : null}
            <button className="grid h-11 w-11 place-items-center rounded-full bg-white/10 lg:hidden" type="button" onClick={() => setMenu(true)} aria-label="Menú">
              <Icon name="menu" />
            </button>
          </div>
        </header>
        <main className="safe-bottom px-4 pb-6 lg:px-6">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
          {mobile.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold ${isActive ? 'text-ink' : 'text-muted'}`}>
              {({ isActive }) => (
                <>
                  <span className={`grid h-8 w-12 place-items-center rounded-full ${isActive ? 'bg-lime text-ink' : ''}`}>
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      {qr ? (
        <Modal title="Abrir en el teléfono" onClose={() => setQr(false)}>
          <ConnectQr />
        </Modal>
      ) : null}
      {menu ? (
        <div className="fixed inset-0 z-50 bg-ink/50 lg:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-y-0 right-0 flex w-[min(100%,320px)] flex-col overflow-auto bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <Brand compact />
              <button className="grid h-11 w-11 place-items-center rounded-full bg-canvas" type="button" onClick={() => setMenu(false)} aria-label="Cerrar">
                <Icon name="close" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {links.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMenu(false)} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold ${isActive ? 'bg-ink text-white' : 'text-ink'}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
            <button className="mt-4 min-h-12 w-full rounded-full bg-canvas font-bold text-ink" type="button" onClick={() => { clearSession(); navigate('/login'); }}>
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Brand({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lime text-lg font-black text-ink">V</span>
      {compact ? <span className={`text-lg font-black ${onDark ? 'text-white' : 'text-ink'}`}>VulcaPOS</span> : (
        <div>
          <p className="text-lg font-black">VulcaPOS</p>
          <p className={`text-xs ${onDark ? 'text-white/60' : 'text-muted'}`}>Vulcanizadora</p>
        </div>
      )}
    </div>
  );
}

function SideLink({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink to={to} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-2xl px-3 font-semibold ${isActive ? 'bg-lime text-ink' : 'text-white/75 hover:bg-white/10'}`}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

function UserBox({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <div className="rounded-3xl bg-white/10 p-3">
      <p className="font-bold">{user.name}</p>
      <p className="text-xs text-white/60">{user.role === 'ADMIN' ? 'Administrador' : 'Caja'}</p>
      <button className="mt-3 min-h-11 w-full rounded-full bg-lime text-sm font-bold text-ink" type="button" onClick={onLogout}>Salir</button>
    </div>
  );
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

type BeforeInstallPrompt = Event & { prompt: () => Promise<void> };

export function Guard({ section, children }: { section: SectionId; children: ReactNode }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(user, section)) {
    const next = firstRoute(user);
    if (next) return <Navigate to={next} replace />;
    return <p className="pt-6 text-sm text-muted">Este usuario no tiene acceso a ninguna parte del sistema.</p>;
  }
  return children;
}

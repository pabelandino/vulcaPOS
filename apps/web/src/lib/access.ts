import { SessionUser } from './api';

export const SECTIONS = [
  { id: 'panel', to: '/panel', label: 'Panel' },
  { id: 'ventas', to: '/ventas', label: 'Ventas' },
  { id: 'ordenes', to: '/ordenes', label: 'Órdenes' },
  { id: 'caja', to: '/caja', label: 'Caja' },
  { id: 'reportes', to: '/reportes', label: 'Reportes' },
  { id: 'planilla', to: '/planilla', label: 'Planilla' },
  { id: 'ingresos', to: '/ingresos', label: 'Ingresos' },
  { id: 'productos', to: '/productos', label: 'Productos' },
  { id: 'servicios', to: '/servicios', label: 'Servicios' },
  { id: 'inventario', to: '/inventario', label: 'Inventario' },
  { id: 'clientes', to: '/clientes', label: 'Clientes' },
  { id: 'proveedores', to: '/proveedores', label: 'Proveedores' },
  { id: 'usuarios', to: '/usuarios', label: 'Usuarios' },
  { id: 'ajustes', to: '/ajustes', label: 'Ajustes' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export const ALL_ACCESS: SectionId[] = SECTIONS.map((item) => item.id);

export const CASHIER_ACCESS: SectionId[] = ['panel', 'ventas', 'ordenes', 'caja', 'reportes', 'clientes', 'ajustes'];

export function canAccess(user: Pick<SessionUser, 'role' | 'access'> | null, section: SectionId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const access = Array.isArray(user.access) ? user.access : CASHIER_ACCESS;
  return access.includes(section);
}

export function firstRoute(user: Pick<SessionUser, 'role' | 'access'> | null) {
  return SECTIONS.find((item) => canAccess(user, item.id))?.to ?? null;
}

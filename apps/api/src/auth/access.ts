export const ALL_SECTIONS = [
  'panel',
  'ventas',
  'ordenes',
  'caja',
  'reportes',
  'planilla',
  'ingresos',
  'productos',
  'servicios',
  'inventario',
  'clientes',
  'proveedores',
  'usuarios',
  'ajustes',
] as const;

export type Section = (typeof ALL_SECTIONS)[number];

export const CASHIER_SECTIONS: Section[] = ['panel', 'ventas', 'ordenes', 'caja', 'reportes', 'clientes', 'ajustes'];

export function sectionsFor(role: 'ADMIN' | 'CASHIER', access: string[]) {
  if (role === 'ADMIN') return [...ALL_SECTIONS];
  const allowed = new Set<string>(ALL_SECTIONS);
  return [...new Set(access.filter((item) => allowed.has(item)))] as Section[];
}

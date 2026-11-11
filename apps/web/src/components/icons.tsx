import { ReactNode } from 'react';

export type IconName =
  | 'panel'
  | 'sales'
  | 'orders'
  | 'cash'
  | 'reports'
  | 'payroll'
  | 'products'
  | 'services'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'settings'
  | 'intake'
  | 'menu'
  | 'close'
  | 'search'
  | 'plus'
  | 'phone';

const PATHS: Record<IconName, ReactNode> = {
  panel: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  sales: (
    <>
      <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.2 11h11.3l2-7H7" />
    </>
  ),
  orders: (
    <>
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </>
  ),
  payroll: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  reports: (
    <>
      <path d="M4 19V10" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19H2" />
    </>
  ),
  products: (
    <>
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </>
  ),
  services: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
    </>
  ),
  inventory: (
    <>
      <path d="M4 7h16v12H4z" />
      <path d="M8 7V5h8v2" />
      <path d="M4 12h16" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14.4 16 15 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M16.2 14.6c1.8.3 3.2 1.4 3.8 3.4" />
    </>
  ),
  suppliers: (
    <>
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
    </>
  ),
  intake: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M4 15v4h16v-4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

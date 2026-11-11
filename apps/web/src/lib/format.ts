export function money(value: number, currency = 'C$') {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currency} ${amount.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const ZONE = 'America/Managua';

export function ymd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(date);
}

function calendarDay(value: string | Date) {
  const iso = value instanceof Date ? value.toISOString() : value;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(iso);
  return match ? match[1] : null;
}

export function prettyDate(value: string | Date) {
  const day = calendarDay(value);
  const date = day ? new Date(`${day}T12:00:00Z`) : typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-NI', { timeZone: day ? 'UTC' : ZONE, day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function prettyTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-NI', { timeZone: ZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
};

export const BROUGHT_LABEL: Record<string, string> = {
  NONE: 'No trae producto',
  TIRE: 'Trae llanta',
  OTHER: 'Trae otro producto',
};

export function quote(
  lines: Array<{ quantity: number; unitPrice: number; discount?: number }>,
  orderDiscount: number,
  taxRate: number,
  pricesIncludeTax: boolean,
) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - (line.discount || 0), 0));
  const discount = roundMoney(Math.min(Math.max(0, orderDiscount), Math.max(subtotal, 0)));
  const after = roundMoney(Math.max(0, subtotal - discount));
  const tax = pricesIncludeTax ? roundMoney(after * (taxRate / (100 + taxRate))) : roundMoney(after * (taxRate / 100));
  const total = pricesIncludeTax ? after : roundMoney(after + tax);
  return { subtotal, discount, tax, total };
}

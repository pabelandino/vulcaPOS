import { Decimal } from '@prisma/client/runtime/library';

export function num(value: Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type PricedLine = {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount?: number;
};

export function lineAmount(line: PricedLine) {
  return money(line.quantity * line.unitPrice - (line.discount || 0));
}

export function priceTotals(
  lines: PricedLine[],
  orderDiscount: number,
  taxRate: number,
  pricesIncludeTax: boolean,
) {
  const subtotal = money(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const discount = money(Math.min(Math.max(0, orderDiscount), subtotal));
  const afterDiscount = money(subtotal - discount);
  const tax = pricesIncludeTax
    ? money(afterDiscount * (taxRate / (100 + taxRate)))
    : money(afterDiscount * (taxRate / 100));
  const total = pricesIncludeTax ? afterDiscount : money(afterDiscount + tax);
  const grossProfit = money(
    lines.reduce((sum, line) => sum + (line.unitPrice - line.unitCost) * line.quantity - (line.discount || 0), 0),
  );
  const profit = money(grossProfit - discount);
  return { subtotal, discount, tax: money(tax), total, profit };
}

export function paymentParts(
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED',
  total: number,
  cash: number,
  card: number,
  transfer: number,
) {
  const received = {
    cash: money(Math.max(0, cash)),
    card: money(Math.max(0, card)),
    transfer: money(Math.max(0, transfer)),
  };
  if (method === 'CASH') {
    if (received.cash + 0.009 < total) {
      throw new Error(`El efectivo no cubre el total (${total.toFixed(2)})`);
    }
    return { cashAmount: total, cardAmount: 0, transferAmount: 0, changeAmount: money(received.cash - total) };
  }
  if (method === 'CARD') {
    return { cashAmount: 0, cardAmount: total, transferAmount: 0, changeAmount: 0 };
  }
  if (method === 'TRANSFER') {
    return { cashAmount: 0, cardAmount: 0, transferAmount: total, changeAmount: 0 };
  }
  const paid = money(received.cash + received.card + received.transfer);
  if (Math.abs(paid - total) > 0.05) {
    throw new Error(`El pago mixto (${paid.toFixed(2)}) debe ser igual al total (${total.toFixed(2)})`);
  }
  return {
    cashAmount: received.cash,
    cardAmount: received.card,
    transferAmount: received.transfer,
    changeAmount: 0,
  };
}

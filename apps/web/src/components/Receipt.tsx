import { BROUGHT_LABEL, money, PAYMENT_LABEL, prettyTime } from '../lib/format';

export type ReceiptData = {
  title?: string;
  number: number;
  createdAt: string;
  cashierName: string;
  customerName: string;
  phone?: string | null;
  plate?: string | null;
  vehicle?: string | null;
  brought?: string | null;
  broughtNote?: string | null;
  lines: Array<{ name: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod?: string | null;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
  changeAmount: number;
};

export type CompanyInfo = {
  name: string;
  tradeName?: string | null;
  ruc?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  voucherTitle: string;
  headerLine?: string | null;
  voucherFooter?: string | null;
  warrantyNote?: string | null;
  taxRate: number;
  pricesIncludeTax: boolean;
  currency: string;
  ticketWidth?: number;
};

export function Receipt({ company, receipt, width, preview = false }: { company: CompanyInfo; receipt: ReceiptData; width?: 58 | 80; preview?: boolean }) {
  const currency = company.currency || 'C$';
  const size: 58 | 80 = width || (company.ticketWidth === 58 ? 58 : 80);
  return (
    <article id={preview ? undefined : 'receipt'} className={`${size === 58 ? 'receipt-58 w-[58mm] p-2 text-[10px] leading-4' : 'receipt-80 w-[80mm] p-3 text-[12px] leading-5'} mx-auto bg-white text-black`}>
      <p className="text-center text-base font-bold">{company.tradeName || company.name}</p>
      <p className="text-center">{company.name}</p>
      {company.ruc ? <p className="text-center">RUC {company.ruc}</p> : null}
      {company.address ? <p className="text-center">{company.address}</p> : null}
      {company.city ? <p className="text-center">{company.city}</p> : null}
      {company.phone ? <p className="text-center">Tel {company.phone}</p> : null}
      {company.headerLine ? <p className="mt-1 text-center">{company.headerLine}</p> : null}
      <p className="mt-2 text-center text-sm font-bold">{company.voucherTitle} {String(receipt.number).padStart(6, '0')}</p>
      <p>{prettyTime(receipt.createdAt)}</p>
      <p>Cajero: {receipt.cashierName}</p>
      <p>Cliente: {receipt.customerName}</p>
      {receipt.phone ? <p>Tel: {receipt.phone}</p> : null}
      {receipt.plate ? <p>Placa: {receipt.plate}</p> : null}
      {receipt.vehicle ? <p>Vehículo: {receipt.vehicle}</p> : null}
      {receipt.brought && receipt.brought !== 'NONE' ? <p>{BROUGHT_LABEL[receipt.brought]}: {receipt.broughtNote}</p> : null}
      <div className="my-2 border-t border-dashed border-black" />
      {receipt.lines.map((line, index) => (
        <div key={`${line.name}-${index}`} className="mb-1">
          <p>{line.name}</p>
          <p className="flex justify-between">
            <span>{line.quantity} x {money(line.unitPrice, currency)}</span>
            <span>{money(line.amount, currency)}</span>
          </p>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Row label="Subtotal" value={money(receipt.subtotal, currency)} />
      <Row label="Descuento" value={money(receipt.discount, currency)} />
      <Row label={company.pricesIncludeTax ? `IVA ${company.taxRate}% incluido` : `IVA ${company.taxRate}%`} value={money(receipt.tax, currency)} />
      <p className="mt-1 flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{money(receipt.total, currency)}</span>
      </p>
      {receipt.paymentMethod ? <p className="mt-1">Pago: {PAYMENT_LABEL[receipt.paymentMethod] || receipt.paymentMethod}</p> : <p>Pendiente de cobro</p>}
      {receipt.cashAmount ? <Row label="Efectivo" value={money(receipt.cashAmount, currency)} /> : null}
      {receipt.cardAmount ? <Row label="Tarjeta" value={money(receipt.cardAmount, currency)} /> : null}
      {receipt.transferAmount ? <Row label="Transferencia" value={money(receipt.transferAmount, currency)} /> : null}
      {receipt.changeAmount ? <Row label="Cambio" value={money(receipt.changeAmount, currency)} /> : null}
      {company.warrantyNote ? <p className="mt-2 text-center">{company.warrantyNote}</p> : null}
      {company.voucherFooter ? <p className="text-center">{company.voucherFooter}</p> : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}

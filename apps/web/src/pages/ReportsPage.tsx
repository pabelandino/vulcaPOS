import { useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { ErrorText, Modal, Pager, PrimaryButton, StatGrid, TableWrap } from '../components/ui';
import { api, apiBlob, getStoredUser, qs } from '../lib/api';
import { money, PAYMENT_LABEL, prettyDate, ymd } from '../lib/format';

type Tab = 'general' | 'vendidos' | 'trabajadores' | 'existencias';
type Summary = {
  net: { count: number; subtotal: number; discount: number; tax: number; total: number; profit: number; cash: number; card: number; transfer: number };
  sales: { count: number };
  services: { count: number };
  returns: { count: number };
  payroll: number;
};
type SaleRow = {
  id: number;
  number: number;
  kind: string;
  status: string;
  businessDate: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  total: number;
  profit: number;
  items: Array<{ id: number; name: string; quantity: number; returnedQty: number; unitPrice: number; amount: number }>;
};
type SalePage = { items: SaleRow[]; total: number; page: number; pages: number; summary: { total: number }; pageSubtotal: number };
type OrderRow = {
  id: number;
  number: number;
  businessDate: string;
  customerName: string;
  plate: string | null;
  cashierName: string;
  paymentMethod: string | null;
  total: number;
  profit: number;
  lines: Array<{ name: string; quantity: number; amount: number }>;
};
type OrderPage = { items: OrderRow[]; total: number; page: number; pages: number; summary: { total: number }; pageSubtotal: number };
type GroupRow = { code: string; name: string; quantity: number; total: number; profit: number; sellers: Array<{ name: string; quantity: number }> };
type GroupPage = { items: GroupRow[]; total: number; page: number; pages: number; summary: { quantity: number; total: number; profit: number } };
type Sold = { products: GroupPage; services: GroupPage };
type Worker = {
  userId: number | null;
  name: string;
  username: string;
  role: 'ADMIN' | 'CASHIER' | null;
  salesTotal: number;
  serviceTotal: number;
  total: number;
  profit: number;
  paid: number;
  documents: number;
  salesCount: number;
  serviceCount: number;
  sold: Array<{ name: string; quantity: number }>;
};
type Workers = { items: Worker[]; summary: { total: number; profit: number; paid: number; workers: number } };
type LowRow = { id: number; sku: string; name: string; category: string | null; stock: number; minStock: number; missing: number; out: boolean };
type LowPage = { items: LowRow[]; total: number; page: number; pages: number; summary: { low: number; out: number; short: number; missingCost: number } };

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'vendidos', label: 'Vendidos' },
  { id: 'trabajadores', label: 'Trabajadores' },
  { id: 'existencias', label: 'Poco stock' },
];

export function ReportsPage() {
  const admin = getStoredUser()?.role === 'ADMIN';
  const toasts = useToasts();
  const today = ymd();
  const [tab, setTab] = useState<Tab>('general');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<SalePage | null>(null);
  const [orders, setOrders] = useState<OrderPage | null>(null);
  const [sold, setSold] = useState<Sold | null>(null);
  const [workers, setWorkers] = useState<Workers | null>(null);
  const [low, setLow] = useState<LowPage | null>(null);
  const [lowQuery, setLowQuery] = useState('');
  const [salePage, setSalePage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [servicePage, setServicePage] = useState(1);
  const [lowPage, setLowPage] = useState(1);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte');
  }

  function loadGeneral(nextSales = salePage, nextOrders = orderPage, range = { from, to }) {
    api<Summary>(`/api/reports/summary${qs(range)}`).then(setSummary).catch(fail);
    api<SalePage>(`/api/reports/sales${qs({ ...range, page: nextSales, pageSize: 8 })}`).then(setSales).catch(fail);
    api<OrderPage>(`/api/reports/orders${qs({ ...range, page: nextOrders, pageSize: 8 })}`).then(setOrders).catch(fail);
  }
  function loadSold(nextProducts = productPage, nextServices = servicePage, range = { from, to }) {
    api<Sold>(`/api/reports/sold${qs({ ...range, productPage: nextProducts, servicePage: nextServices, pageSize: 8 })}`).then(setSold).catch(fail);
  }
  function loadWorkers(range = { from, to }) {
    api<Workers>(`/api/reports/workers${qs(range)}`).then(setWorkers).catch(fail);
  }
  function loadLow(next = lowPage, q = lowQuery) {
    api<LowPage>(`/api/reports/low-stock${qs({ page: next, pageSize: 10, q })}`).then(setLow).catch(fail);
  }
  function loadTab(next: Tab, range = { from, to }) {
    setError('');
    if (next === 'general') loadGeneral(salePage, orderPage, range);
    if (next === 'vendidos') loadSold(productPage, servicePage, range);
    if (next === 'trabajadores') loadWorkers(range);
    if (next === 'existencias') loadLow(lowPage, lowQuery);
  }

  useEffect(() => { loadTab('general'); }, []);

  async function refund() {
    if (!selected) return;
    const lines = selected.items.filter((item) => (qty[item.id] || 0) > 0).map((item) => ({ saleItemId: item.id, quantity: qty[item.id] }));
    if (!lines.length) {
      toasts.err('Indique la cantidad a devolver');
      return;
    }
    try {
      await api(`/api/sales/${selected.id}/return`, { method: 'POST', body: JSON.stringify({ lines, paymentMethod: 'CASH', cashAmount: selected.total }) });
      toasts.ok('Devolución registrada');
      setSelected(null);
      loadGeneral();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo devolver');
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const result = await apiBlob(`/api/reports/export${qs({
        tab,
        from: tab === 'existencias' ? undefined : from,
        to: tab === 'existencias' ? undefined : to,
        q: tab === 'existencias' ? lowQuery : undefined,
      })}`);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toasts.ok('Excel descargado');
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  const cards = summary ? [
    { label: 'Documentos', value: String(summary.net.count), hint: `${summary.sales.count} de productos · ${summary.services.count} de servicios · ${summary.returns.count} devoluciones` },
    { label: 'Total', value: money(summary.net.total) },
    { label: 'Efectivo', value: money(summary.net.cash) },
    { label: 'Tarjeta', value: money(summary.net.card) },
    { label: 'Transferencia', value: money(summary.net.transfer) },
    { label: 'Pagado a trabajadores', value: money(summary.payroll || 0), hint: 'Lo que se registró en la planilla en estas fechas: salarios, adelantos, comisiones y bonos.' },
    ...(admin ? [{ label: 'Ganancia', value: money(summary.net.profit) }] : []),
  ] : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-navy">Reportes</h1>
      <div className="grid grid-cols-2 gap-1 rounded-3xl bg-white p-1 shadow-sm sm:grid-cols-4">
        {TABS.map((item) => (
          <button key={item.id} className={`min-h-12 rounded-full px-2 text-sm font-bold ${tab === item.id ? 'bg-ink text-white' : 'text-ink'}`} type="button" onClick={() => { setTab(item.id); loadTab(item.id); }}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'existencias' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input className="min-h-12 w-full rounded-2xl border border-line bg-white px-3" placeholder="Buscar producto" value={lowQuery} onChange={(event) => { setLowQuery(event.target.value); setLowPage(1); loadLow(1, event.target.value); }} />
          <PrimaryButton className="shrink-0" disabled={exporting} onClick={() => void exportExcel()}>{exporting ? 'Exportando…' : 'Exportar Excel'}</PrimaryButton>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-sm font-semibold">Desde<input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-white px-3" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-sm font-semibold">Hasta<input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-white px-3" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <PrimaryButton onClick={() => { setSalePage(1); setOrderPage(1); setProductPage(1); setServicePage(1); loadTab(tab, { from, to }); }}>Consultar</PrimaryButton>
          <PrimaryButton disabled={exporting} onClick={() => void exportExcel()}>{exporting ? 'Exportando…' : 'Exportar Excel'}</PrimaryButton>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {tab === 'general' ? (
        <>
          <StatGrid items={cards} />
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-bold text-navy">Ventas de productos</h2>
              {sales ? <p className="text-sm text-muted">Página {money(sales.pageSubtotal)} · rango {money(sales.summary.total)}</p> : null}
            </div>
            <TableWrap>
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Nº</th><th>Fecha</th><th>Cliente</th><th>Vendió</th><th>Producto</th><th>Pago</th><th>Total</th>{admin ? <th>Ganancia</th> : null}<th></th></tr></thead>
                <tbody>
                  {sales?.items.length ? sales.items.map((row) => (
                    <tr key={row.id} className="border-t border-line align-top">
                      <td className="px-4 py-3 font-bold">{row.kind === 'RETURN' ? 'DEV ' : ''}{row.number}</td>
                      <td>{prettyDate(row.businessDate)}</td>
                      <td>{row.customerName}</td>
                      <td className="font-bold">{row.cashierName}</td>
                      <td><LineList lines={row.items} /></td>
                      <td>{PAYMENT_LABEL[row.paymentMethod]}</td>
                      <td className="font-bold">{money(row.kind === 'RETURN' ? -row.total : row.total)}</td>
                      {admin ? <td>{money(row.kind === 'RETURN' ? -row.profit : row.profit)}</td> : null}
                      <td>{row.kind === 'SALE' && row.status === 'PAID' ? <button className="font-bold text-horizon" type="button" onClick={() => { setSelected(row); setQty({}); }}>Devolver</button> : row.status}</td>
                    </tr>
                  )) : <Empty cols={admin ? 9 : 8} text="No hay ventas de productos en este rango." />}
                </tbody>
              </table>
            </TableWrap>
            {sales ? <Pager page={sales.page} pages={sales.pages} total={sales.total} onPage={(next) => { setSalePage(next); loadGeneral(next, orderPage); }} /> : null}
          </section>
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-bold text-navy">Servicios cobrados</h2>
              {orders ? <p className="text-sm text-muted">Página {money(orders.pageSubtotal)} · rango {money(orders.summary.total)}</p> : null}
            </div>
            <TableWrap>
              <table className="min-w-[940px] w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Nº</th><th>Fecha</th><th>Cliente</th><th>Vendió</th><th>Detalle</th><th>Pago</th><th>Total</th>{admin ? <th>Ganancia</th> : null}</tr></thead>
                <tbody>
                  {orders?.items.length ? orders.items.map((row) => (
                    <tr key={row.id} className="border-t border-line align-top">
                      <td className="px-4 py-3 font-bold">{row.number}</td>
                      <td>{prettyDate(row.businessDate)}</td>
                      <td>{row.customerName}{row.plate ? <><br /><span className="text-xs text-muted">{row.plate}</span></> : null}</td>
                      <td className="font-bold">{row.cashierName}</td>
                      <td><LineList lines={row.lines || []} /></td>
                      <td>{row.paymentMethod ? PAYMENT_LABEL[row.paymentMethod] : 'Pendiente'}</td>
                      <td className="font-bold">{money(row.total)}</td>
                      {admin ? <td>{money(row.profit)}</td> : null}
                    </tr>
                  )) : <Empty cols={admin ? 8 : 7} text="No hay servicios cobrados en este rango." />}
                </tbody>
              </table>
            </TableWrap>
            {orders ? <Pager page={orders.page} pages={orders.pages} total={orders.total} onPage={(next) => { setOrderPage(next); loadGeneral(salePage, next); }} /> : null}
          </section>
        </>
      ) : null}
      {tab === 'vendidos' && sold ? (
        <>
          <GroupTable title="Productos vendidos" page={sold.products} admin={admin} onPage={(next) => { setProductPage(next); loadSold(next, servicePage); }} />
          <GroupTable title="Servicios realizados" page={sold.services} admin={admin} onPage={(next) => { setServicePage(next); loadSold(productPage, next); }} />
        </>
      ) : null}
      {tab === 'trabajadores' && workers ? (
        <section className="space-y-2">
          <StatGrid items={[
            { label: 'Trabajadores', value: String(workers.summary.workers) },
            { label: 'Cobrado', value: money(workers.summary.total) },
            { label: 'Pagado en planilla', value: money(workers.summary.paid) },
            ...(admin ? [{ label: 'Ganancia', value: money(workers.summary.profit) }] : []),
          ]} />
          <p className="text-sm text-muted">Lo cobrado sale de las ventas y servicios que atendió cada usuario. Lo pagado es la planilla registrada en esas fechas.</p>
          <TableWrap>
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Trabajador</th><th>Vendió</th><th>Documentos</th><th>Productos</th><th>Servicios</th><th>Cobrado</th><th>Planilla</th>{admin ? <th>Ganancia</th> : null}</tr></thead>
              <tbody>
                {workers.items.length ? workers.items.map((row) => (
                  <tr key={`${row.userId}-${row.name}`} className="border-t border-line align-top">
                    <td className="px-4 py-3 font-bold">{row.name}<br /><span className="text-xs font-semibold text-muted">{row.role === 'ADMIN' ? 'Administrador' : row.role === 'CASHIER' ? 'Caja' : row.username}</span></td>
                    <td className="py-3">{row.sold.length ? row.sold.map((item) => <span key={item.name} className="block">{item.name} × {item.quantity}</span>) : <span className="text-muted">Nada en este rango</span>}</td>
                    <td>{row.documents}</td>
                    <td>{money(row.salesTotal)}<br /><span className="text-xs text-muted">{row.salesCount} ventas</span></td>
                    <td>{money(row.serviceTotal)}<br /><span className="text-xs text-muted">{row.serviceCount} servicios</span></td>
                    <td className="font-bold">{money(row.total)}</td>
                    <td>{money(row.paid)}</td>
                    {admin ? <td>{money(row.profit)}</td> : null}
                  </tr>
                )) : <Empty cols={admin ? 8 : 7} text="Nadie cobró ni recibió planilla en este rango." />}
              </tbody>
            </table>
          </TableWrap>
        </section>
      ) : null}
      {tab === 'existencias' && low ? (
        <section className="space-y-2">
          <StatGrid items={[
            { label: 'Con poco o nada', value: String(low.summary.low) },
            { label: 'Sin existencia', value: String(low.summary.out) },
            { label: 'Bajo el mínimo', value: String(low.summary.short) },
            { label: 'Costo de lo que falta', value: money(low.summary.missingCost) },
          ]} />
          <TableWrap>
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Producto</th><th>Existencia</th><th>Mínimo</th><th>Faltan</th><th>Estado</th></tr></thead>
              <tbody>
                {low.items.length ? low.items.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3 font-bold">{row.name}<br /><span className="text-xs text-muted">{row.sku}{row.category ? ` · ${row.category}` : ''}</span></td>
                    <td className="font-bold text-red-600">{row.stock}</td>
                    <td>{row.minStock}</td>
                    <td>{row.missing}</td>
                    <td>{row.out ? 'Sin existencia' : 'Bajo el mínimo'}</td>
                  </tr>
                )) : <Empty cols={5} text="No hay productos en cero ni por debajo del mínimo." />}
              </tbody>
            </table>
          </TableWrap>
          <Pager page={low.page} pages={low.pages} total={low.total} onPage={(next) => { setLowPage(next); loadLow(next); }} />
        </section>
      ) : null}
      {selected ? (
        <Modal title={`Devolver venta ${selected.number}`} onClose={() => setSelected(null)}>
          <div className="space-y-3">
            {selected.items.map((item) => {
              const left = item.quantity - item.returnedQty;
              return (
                <label key={item.id} className="block text-sm">
                  <span className="font-semibold">{item.name}</span>
                  <span className="ml-2 text-muted">disponible {left}</span>
                  <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" inputMode="decimal" value={qty[item.id] || ''} onChange={(event) => setQty({ ...qty, [item.id]: Math.min(left, Number(event.target.value) || 0) })} />
                </label>
              );
            })}
          </div>
          <PrimaryButton className="mt-4 w-full" onClick={() => void refund()}>Registrar devolución en efectivo</PrimaryButton>
        </Modal>
      ) : null}
    </div>
  );
}

function LineList({ lines }: { lines: Array<{ name: string; quantity: number }> }) {
  if (!lines.length) return <span className="text-muted">Sin detalle</span>;
  return (
    <span className="block">
      {lines.map((line, index) => (
        <span key={`${line.name}-${index}`} className="block">{line.name} × {line.quantity}</span>
      ))}
    </span>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return <tr><td className="px-4 py-6 text-muted" colSpan={cols}>{text}</td></tr>;
}

function GroupTable({ title, page, admin, onPage }: { title: string; page: GroupPage; admin: boolean; onPage: (page: number) => void }) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-bold text-navy">{title}</h2>
        <p className="text-sm text-muted">{page.summary.quantity} und · {money(page.summary.total)}</p>
      </div>
      <TableWrap>
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Nombre</th><th>Vendió</th><th>Cantidad</th><th>Total</th>{admin ? <th>Ganancia</th> : null}</tr></thead>
          <tbody>
            {page.items.length ? page.items.map((row) => (
              <tr key={row.code} className="border-t border-line align-top">
                <td className="px-4 py-3 font-bold">{row.name}<br /><span className="text-xs text-muted">{row.code}</span></td>
                <td className="py-3">{row.sellers.length ? row.sellers.map((seller) => <span key={seller.name} className="block">{seller.name} × {seller.quantity}</span>) : <span className="text-muted">Sin vendedor</span>}</td>
                <td>{row.quantity}</td>
                <td className="font-bold">{money(row.total)}</td>
                {admin ? <td>{money(row.profit)}</td> : null}
              </tr>
            )) : <Empty cols={admin ? 5 : 4} text="Nada en este rango." />}
          </tbody>
        </table>
      </TableWrap>
      <Pager page={page.page} pages={page.pages} total={page.total} onPage={onPage} />
    </section>
  );
}

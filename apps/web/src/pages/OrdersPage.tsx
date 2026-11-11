import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToasts } from '../components/Toasts';
import { ErrorText, Pager, PrimaryButton, StatGrid, TableWrap } from '../components/ui';
import { api, getStoredUser, qs } from '../lib/api';
import { money, prettyDate } from '../lib/format';

type OrderLine = {
  id: number;
  kind: string;
  name: string;
  quantity: number;
};
type Order = {
  id: number;
  number: number;
  status: string;
  businessDate: string;
  customerName: string;
  plate: string | null;
  brought: string;
  broughtNote: string | null;
  total: number;
  lines: OrderLine[];
};
type Page = { items: Order[]; total: number; page: number; pages: number; summary: { open: number; openTotal: number; paidToday: number; paidTodayTotal: number } };

export function OrdersPage() {
  const navigate = useNavigate();
  const toasts = useToasts();
  const admin = getStoredUser()?.role === 'ADMIN';
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState('');

  function load(next = page, nextStatus = status) {
    api<Page>(`/api/orders${qs({ page: next, pageSize: 10, status: nextStatus || undefined })}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }
  useEffect(() => { load(1, status); setPage(1); }, [status]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-navy">Órdenes de servicio</h1>
        <p className="text-sm text-muted">Un servicio que todavía no se cobra. Guardar orden lo deja aquí, con el cliente y el trabajo, para continuarlo o cobrarlo después.</p>
      </div>
      {data ? (
        <StatGrid items={[
          { label: 'Abiertas', value: String(data.summary.open) },
          { label: 'Por cobrar', value: money(data.summary.openTotal) },
          { label: 'Cobradas hoy', value: String(data.summary.paidToday) },
          { label: 'Total cobrado hoy', value: money(data.summary.paidTodayTotal) },
        ]} />
      ) : null}
      <div className="flex gap-2">
        {[['OPEN', 'Abiertas'], ['PAID', 'Pagadas'], ['', 'Todas']].map(([value, label]) => (
          <button key={label} className={`min-h-11 rounded-2xl px-4 font-bold ${status === value ? 'bg-horizon text-white' : 'bg-white text-navy'}`} type="button" onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <TableWrap>
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Orden</th><th>Fecha</th><th>Cliente</th><th>Detalle</th><th>Estado</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((order) => (
              <tr key={order.id} className="border-t border-line align-top">
                <td className="px-4 py-3 font-bold text-navy">{order.number}</td>
                <td className="py-3">{prettyDate(order.businessDate)}</td>
                <td className="py-3">{order.customerName}<br /><span className="text-xs text-muted">{order.plate}</span></td>
                <td className="py-3">
                  {order.lines?.length ? order.lines.map((line) => (
                    <span key={line.id} className="block text-sm">
                      <span className="text-xs font-bold uppercase text-muted">{line.kind === 'PRODUCT' ? 'Producto' : 'Servicio'}</span>
                      {' '}{line.name} × {line.quantity}
                    </span>
                  )) : <span className="text-xs text-muted">Sin detalle</span>}
                </td>
                <td>{order.status === 'OPEN' ? 'Abierta' : order.status === 'PAID' ? 'Pagada' : 'Anulada'}</td>
                <td className="font-bold">{money(order.total)}</td>
                <td className="px-3">
                  {order.status === 'OPEN' ? <PrimaryButton onClick={() => navigate('/ventas', { state: { orderId: order.id } })}>Continuar</PrimaryButton> : <span className="text-xs font-bold text-muted">{order.status === 'PAID' ? 'Pagada' : 'Anulada'}</span>}
                  {admin && order.status !== 'VOID' ? <button className="ml-2 text-xs font-bold text-red-600" type="button" onClick={() => api(`/api/orders/${order.id}/void`, { method: 'POST' }).then(() => { toasts.ok('Orden anulada'); load(); }).catch((err: Error) => toasts.err(err.message))}>Anular</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={(next) => { setPage(next); load(next); }} /> : null}
    </div>
  );
}

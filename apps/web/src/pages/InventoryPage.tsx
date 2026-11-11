import { useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';
import { money, prettyTime } from '../lib/format';

type Product = { id: number; sku: string; name: string; stock: number; minStock: number; cost: number; low: boolean };
type ProductPage = { items: Product[]; total: number; page: number; pages: number; summary: { skus: number; stockValue: number; low: number } };
type Move = { id: number; qty: number; reason: string; ref: string | null; createdAt: string; product: { name: string; sku: string } | null };
type MovePage = { items: Move[]; total: number; page: number; pages: number };

export function InventoryPage() {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductPage | null>(null);
  const [moves, setMoves] = useState<MovePage | null>(null);
  const [movePage, setMovePage] = useState(1);
  const [edit, setEdit] = useState<Product | null>(null);
  const [stock, setStock] = useState(0);
  const [reason, setReason] = useState('Conteo físico');

  function load(next = page, query = q, stock = maxStock, low = lowOnly) {
    api<ProductPage>(`/api/products${qs({ page: next, pageSize: 10, q: query, all: 1, maxStock: stock, low: low ? 1 : undefined })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(1, q, maxStock, lowOnly); }, [q, maxStock, lowOnly]);
  useEffect(() => { api<MovePage>(`/api/inventory/moves${qs({ page: movePage, pageSize: 8 })}`).then(setMoves).catch(() => undefined); }, [movePage]);

  async function save() {
    if (!edit) return;
    try {
      await api(`/api/products/${edit.id}/stock`, { method: 'POST', body: JSON.stringify({ stock, reason }) });
      setEdit(null);
      toasts.ok('Existencia actualizada');
      load();
      setMovePage(1);
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo ajustar');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-navy">Inventario</h1>
      {data ? <StatGrid items={[{ label: 'Productos', value: String(data.summary.skus) }, { label: 'Valor al costo', value: money(data.summary.stockValue) }, { label: 'Bajo mínimo', value: String(data.summary.low) }]} /> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-center">
        <input className={controlClass} placeholder="Buscar producto" value={q} onChange={(event) => setQ(event.target.value)} />
        <input className={controlClass} inputMode="decimal" placeholder="Existencia hasta" value={maxStock} onChange={(event) => setMaxStock(event.target.value)} />
        <button className={`min-h-12 rounded-full px-4 font-bold ${lowOnly ? 'bg-ink text-white' : 'bg-white text-ink'}`} type="button" onClick={() => setLowOnly((value) => !value)}>En el mínimo</button>
      </div>
      <TableWrap>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Producto</th><th>Existencia</th><th>Mínimo</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.name}<br /><span className="text-xs text-muted">{item.sku}</span></td>
                <td className={item.low ? 'font-bold text-red-600' : ''}>{item.stock}</td>
                <td>{item.minStock}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => { setEdit(item); setStock(item.stock); }}>Ajustar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={(next) => { setPage(next); load(next); }} /> : null}
      <h2 className="font-bold text-navy">Movimientos</h2>
      <TableWrap>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Cuando</th><th>Producto</th><th>Cantidad</th><th>Motivo</th></tr></thead>
          <tbody>
            {moves?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">{prettyTime(item.createdAt)}</td>
                <td>{item.product?.name}</td>
                <td className={item.qty < 0 ? 'text-red-600' : 'text-emerald-700'}>{item.qty}</td>
                <td>{item.reason} {item.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {moves ? <Pager page={moves.page} pages={moves.pages} total={moves.total} onPage={setMovePage} /> : null}
      {edit ? (
        <Modal title={`Ajustar ${edit.name}`} onClose={() => setEdit(null)}>
          <label className="text-sm font-semibold">Nueva existencia<input className={`${controlClass} mt-1`} inputMode="decimal" value={stock} onChange={(event) => setStock(Number(event.target.value) || 0)} /></label>
          <label className="mt-3 block text-sm font-semibold">Motivo<input className={`${controlClass} mt-1`} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <PrimaryButton className="mt-4 w-full" onClick={() => void save()}>Guardar ajuste</PrimaryButton>
        </Modal>
      ) : null}
    </div>
  );
}

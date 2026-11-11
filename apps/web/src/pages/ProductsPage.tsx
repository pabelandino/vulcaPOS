import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';
import { money } from '../lib/format';

type Product = { id: number; sku: string; barcode: string | null; name: string; category: string | null; cost: number; price: number; stock: number; minStock: number; supplierId: number | null; active: boolean; low: boolean };
type Page = { items: Product[]; total: number; page: number; pages: number; summary: { skus: number; stockValue: number; retailValue: number; low: number } };
type Supplier = { id: number; name: string };
const empty = { sku: '', barcode: '', name: '', category: 'Llantas', cost: 0, price: 0, stock: 0, minStock: 0, supplierId: 0, active: true };

export function ProductsPage() {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<typeof empty & { id?: number } | null>(null);

  function load(next = page, query = q, stock = maxStock, low = lowOnly) {
    api<Page>(`/api/products${qs({ page: next, pageSize: 10, q: query, all: 1, maxStock: stock, low: low ? 1 : undefined })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(1, q, maxStock, lowOnly); }, [q, maxStock, lowOnly]);
  useEffect(() => { api<{ items: Supplier[] }>('/api/suppliers?pageSize=50').then((rows) => setSuppliers(rows.items)).catch(() => undefined); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      const body = { ...form, supplierId: form.supplierId || null };
      if (form.id) await api(`/api/products/${form.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
      setForm(null);
      toasts.ok('Producto guardado');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy">Productos</h1>
        <PrimaryButton onClick={() => setForm(empty)}>Nuevo producto</PrimaryButton>
      </div>
      {data ? <StatGrid items={[
        { label: 'Activos', value: String(data.summary.skus) },
        { label: 'Valor al costo', value: money(data.summary.stockValue) },
        { label: 'Valor de venta', value: money(data.summary.retailValue) },
        { label: 'Bajo mínimo', value: String(data.summary.low) },
      ]} /> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-center">
        <input className={controlClass} placeholder="Buscar nombre, SKU o código" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} />
        <input className={controlClass} inputMode="decimal" placeholder="Existencia hasta" value={maxStock} onChange={(event) => { setMaxStock(event.target.value); setPage(1); }} />
        <button className={`min-h-12 rounded-full px-4 font-bold ${lowOnly ? 'bg-ink text-white' : 'bg-white text-ink'}`} type="button" onClick={() => { setLowOnly((value) => !value); setPage(1); }}>En el mínimo</button>
      </div>
      <p className="text-xs text-muted">«Existencia hasta» muestra los que tienen esa cantidad o menos. «En el mínimo» muestra los que ya llegaron a su mínimo.</p>
      <TableWrap>
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">SKU</th><th>Producto</th><th>Costo</th><th>Precio</th><th>Existencia</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.sku}<br /><span className="text-xs text-muted">{item.barcode}</span></td>
                <td>{item.name}<br /><span className="text-xs text-muted">{item.category}</span></td>
                <td>{money(item.cost)}</td>
                <td className="font-bold">{money(item.price)}</td>
                <td className={item.low ? 'font-bold text-red-600' : ''}>{item.stock} / {item.minStock}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => setForm({ ...item, barcode: item.barcode || '', category: item.category || '', supplierId: item.supplierId || 0 })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={(next) => { setPage(next); load(next); }} /> : null}
      {form ? (
        <Modal title={form.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Input label="SKU" value={form.sku} onChange={(sku) => setForm({ ...form, sku })} />
            <Input label="Código de barras" value={form.barcode} onChange={(barcode) => setForm({ ...form, barcode })} />
            <label className="sm:col-span-2 text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <Input label="Categoría" value={form.category} onChange={(category) => setForm({ ...form, category })} />
            <label className="text-sm font-semibold">Proveedor
              <select className={`${controlClass} mt-1`} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: Number(event.target.value) })}>
                <option value={0}>Sin proveedor</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <Input label="Costo" value={form.cost} onChange={(cost) => setForm({ ...form, cost: Number(cost) || 0 })} />
            <Input label="Precio" value={form.price} onChange={(price) => setForm({ ...form, price: Number(price) || 0 })} />
            <Input label="Existencia" value={form.stock} onChange={(stock) => setForm({ ...form, stock: Number(stock) || 0 })} />
            <Input label="Mínimo" value={form.minStock} onChange={(minStock) => setForm({ ...form, minStock: Number(minStock) || 0 })} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Activo</label>
            <PrimaryButton className="sm:col-span-2">Guardar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string | number; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold">{label}<input className={`${controlClass} mt-1`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

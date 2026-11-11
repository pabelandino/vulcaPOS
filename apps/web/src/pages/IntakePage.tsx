import { useEffect, useMemo, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Icon } from '../components/icons';
import { ErrorText, Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';
import { money, prettyTime } from '../lib/format';

type Product = { id: number; sku: string; name: string; stock: number; cost: number; price: number; category: string | null };
type Supplier = { id: number; name: string; phone: string | null; ruc: string | null };
type SupplierPage = { items: Supplier[]; total: number; page: number; pages: number };
type Line = { key: string; productId: number; name: string; sku: string; stock: number; quantity: number; cost: number; price: number };
type Receipt = {
  id: number;
  invoiceNumber: string;
  supplierName: string | null;
  notes: string | null;
  createdAt: string;
  userName: string;
  totalCost: number;
  lines: Array<{ id: number; name: string; sku: string; quantity: number; cost: number; price: number }>;
};
type ReceiptPage = { items: Receipt[]; total: number; page: number; pages: number; summary: { count: number; pageCost: number } };

export function IntakePage() {
  const toasts = useToasts();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searched, setSearched] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', category: 'General', cost: 0, price: 0, barcode: '', minStock: 0 });
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<ReceiptPage | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + line.cost * line.quantity, 0), [lines]);

  function loadHistory(next = page) {
    api<ReceiptPage>(`/api/receipts${qs({ page: next, pageSize: 8 })}`).then(setHistory).catch((err: Error) => toasts.err(err.message));
  }

  useEffect(() => { loadHistory(1); }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = window.setTimeout(() => {
      api<{ items: Product[] }>(`/api/products${qs({ q: term, pageSize: 8 })}`)
        .then((data) => { setResults(data.items); setSearched(true); })
        .catch(() => { setResults([]); setSearched(true); });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  function addProduct(product: Product) {
    setLines((current) => {
      const found = current.find((line) => line.productId === product.id);
      if (found) {
        return current.map((line) => (line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, {
        key: `p-${product.id}`,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        quantity: 1,
        cost: product.cost,
        price: product.price,
      }];
    });
    setQuery('');
    setResults([]);
  }

  async function save() {
    if (!invoiceNumber.trim()) {
      setError('Escriba el número de factura');
      toasts.err('Escriba el número de factura');
      return;
    }
    if (!lines.length) {
      setError('Agregue al menos un producto');
      toasts.err('Agregue al menos un producto');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await api<Receipt>('/api/receipts', {
        method: 'POST',
        body: JSON.stringify({
          invoiceNumber,
          supplierId: supplier?.id || null,
          notes,
          lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, cost: line.cost, price: line.price })),
        }),
      });
      toasts.ok(`Factura ${saved.invoiceNumber} ingresada. Existencias actualizadas.`);
      setInvoiceNumber('');
      setNotes('');
      setSupplier(null);
      setLines([]);
      setPage(1);
      loadHistory(1);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'No se pudo guardar el ingreso';
      setError(text);
      toasts.err(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-ink">Ingresos</h1>
        <p className="text-sm text-muted">Una factura puede traer varios productos. Si el producto ya existe, se suma la existencia y se actualiza el precio cuando cambia.</p>
      </div>
      <section className="space-y-3 rounded-[28px] bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Número de factura
            <input className={`${controlClass} mt-1`} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="001-001-0000123" />
          </label>
          <div className="text-sm font-semibold">Proveedor
            <button className={`${controlClass} mt-1 text-left`} type="button" onClick={() => setSupplierOpen(true)}>{supplier?.name || 'Elegir proveedor'}</button>
          </div>
        </div>
        <label className="block text-sm font-semibold">Nota
          <input className={`${controlClass} mt-1`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted" />
          <input className={`${controlClass} pl-10`} placeholder="Buscar producto por nombre, SKU o código" value={query} onChange={(event) => setQuery(event.target.value)} />
          {results.length || (searched && query.trim().length >= 2) ? (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-line bg-white shadow-lg">
              {results.map((product) => (
                <button key={product.id} type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-3 text-left hover:bg-canvas" onClick={() => addProduct(product)}>
                  <span>
                    <span className="block font-bold">{product.name}</span>
                    <span className="text-xs text-muted">{product.sku} · exist. {product.stock} · {money(product.price)}</span>
                  </span>
                  <Icon name="plus" />
                </button>
              ))}
              {searched && !results.length ? (
                <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-3 text-left font-bold hover:bg-canvas" onClick={() => { setDraft({ name: query.trim(), category: 'General', cost: 0, price: 0, barcode: '', minStock: 0 }); setCreateOpen(true); }}>
                  Crear «{query.trim()}»
                  <Icon name="plus" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          {lines.map((line) => (
            <article key={line.key} className="rounded-2xl bg-canvas p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{line.name}</p>
                  <p className="text-xs text-muted">{line.sku} · ahora hay {line.stock} · quedarán {line.stock + line.quantity}</p>
                </div>
                <button type="button" className="text-sm font-bold text-red-600" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Quitar</button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <label className="text-xs font-semibold">Cantidad
                  <input className={`${controlClass} mt-1`} inputMode="decimal" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.max(0, Number(event.target.value) || 0) } : item))} />
                </label>
                <label className="text-xs font-semibold">Costo
                  <input className={`${controlClass} mt-1`} inputMode="decimal" value={line.cost} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, cost: Number(event.target.value) || 0 } : item))} />
                </label>
                <label className="text-xs font-semibold">Precio venta
                  <input className={`${controlClass} mt-1`} inputMode="decimal" value={line.price} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, price: Number(event.target.value) || 0 } : item))} />
                </label>
              </div>
            </article>
          ))}
          {!lines.length ? <p className="text-sm text-muted">Busque productos y agréguelos a esta factura.</p> : null}
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white">
          <span className="text-sm">Costo de la factura</span>
          <span className="text-xl font-black">{money(totalCost)}</span>
        </div>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton className="w-full" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando...' : 'Registrar ingreso'}</PrimaryButton>
      </section>
      {history ? <StatGrid items={[{ label: 'Facturas', value: String(history.summary.count) }, { label: 'Costo de esta página', value: money(history.summary.pageCost) }]} /> : null}
      <h2 className="font-bold">Facturas ingresadas</h2>
      <TableWrap>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr><th className="px-4 py-3">Factura</th><th>Fecha</th><th>Proveedor</th><th>Costo</th><th></th></tr>
          </thead>
          <tbody>
            {history?.items.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{row.invoiceNumber}</td>
                <td>{prettyTime(row.createdAt)}</td>
                <td>{row.supplierName || '—'}</td>
                <td className="font-bold">{money(row.totalCost)}</td>
                <td><button className="font-bold" type="button" onClick={() => setOpenId(openId === row.id ? null : row.id)}>{openId === row.id ? 'Ocultar' : 'Ver'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {openId ? (
        <div className="rounded-3xl bg-white p-4 text-sm shadow-sm">
          {history?.items.find((row) => row.id === openId)?.lines.map((line) => (
            <p key={line.id} className="flex justify-between gap-3 border-b border-line py-2">
              <span>{line.name} · {line.quantity}</span>
              <span>costo {money(line.cost)} · venta {money(line.price)}</span>
            </p>
          ))}
        </div>
      ) : null}
      {history ? <Pager page={history.page} pages={history.pages} total={history.total} onPage={(next) => { setPage(next); loadHistory(next); }} /> : null}
      {supplierOpen ? <SupplierModal selectedId={supplier?.id || 0} onClose={() => setSupplierOpen(false)} onPick={(row) => { setSupplier(row.id ? row : null); setSupplierOpen(false); }} /> : null}
      {createOpen ? (
        <Modal title="Nuevo producto" onClose={() => setCreateOpen(false)}>
          <p className="mb-3 text-sm text-muted">El código se asigna solo. La cantidad se pone en la factura y la existencia sube al registrar el ingreso.</p>
          <div className="grid gap-3">
            <label className="text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">Categoría<input className={`${controlClass} mt-1`} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
            <label className="text-sm font-semibold">Código de barras<input className={`${controlClass} mt-1`} value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} /></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-semibold">Costo<input className={`${controlClass} mt-1`} inputMode="decimal" value={draft.cost || ''} onChange={(event) => setDraft({ ...draft, cost: Number(event.target.value) || 0 })} /></label>
              <label className="text-xs font-semibold">Precio<input className={`${controlClass} mt-1`} inputMode="decimal" value={draft.price || ''} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) || 0 })} /></label>
              <label className="text-xs font-semibold">Mínimo<input className={`${controlClass} mt-1`} inputMode="decimal" value={draft.minStock || ''} onChange={(event) => setDraft({ ...draft, minStock: Number(event.target.value) || 0 })} /></label>
            </div>
            <PrimaryButton onClick={() => void createProduct()}>Crear y agregar</PrimaryButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );

  async function createProduct() {
    if (draft.name.trim().length < 2) {
      toasts.err('Escriba el nombre del producto');
      return;
    }
    try {
      const saved = await api<Product>('/api/products', { method: 'POST', body: JSON.stringify({ ...draft, stock: 0 }) });
      addProduct(saved);
      setCreateOpen(false);
      toasts.ok(`${saved.name} creado. Indique la cantidad en la factura.`);
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo crear el producto');
    }
  }
}

function SupplierModal({ selectedId, onClose, onPick }: { selectedId: number; onClose: () => void; onPick: (supplier: Supplier) => void }) {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SupplierPage | null>(null);

  useEffect(() => {
    api<SupplierPage>(`/api/suppliers${qs({ q, page, pageSize: 6 })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }, [q, page]);

  return (
    <Modal title="Proveedor" onClose={onClose}>
      <input className={controlClass} placeholder="Buscar proveedor" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} />
      <TableWrap>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-3 py-2">Nombre</th><th>Teléfono</th></tr></thead>
          <tbody>
            {data?.items.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-1 py-1">
                  <button type="button" className={`min-h-12 w-full rounded-xl px-2 text-left font-bold ${row.id === selectedId ? 'bg-lime' : ''}`} onClick={() => onPick(row)}>
                    {row.name}
                    {row.ruc ? <span className="mt-0.5 block text-xs font-medium text-muted">{row.ruc}</span> : null}
                  </button>
                </td>
                <td className="text-muted">{row.phone || '—'}</td>
              </tr>
            ))}
            {!data?.items.length ? <tr><td className="px-3 py-3 text-muted" colSpan={2}>No hay proveedores con ese dato.</td></tr> : null}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
      <button className="mt-3 min-h-11 w-full rounded-full bg-canvas font-bold" type="button" onClick={() => onPick({ id: 0, name: '', phone: null, ruc: null })}>Sin proveedor</button>
    </Modal>
  );
}

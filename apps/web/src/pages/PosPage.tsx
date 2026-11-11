import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { CompanyInfo, Receipt, ReceiptData } from '../components/Receipt';
import { useToasts } from '../components/Toasts';
import { ErrorText, Modal, PrimaryButton, Spinner, TableWrap } from '../components/ui';
import { api, NetworkError, qs } from '../lib/api';
import { money, PAYMENT_LABEL, quote, roundMoney } from '../lib/format';
import { cacheGet, cachePut, enqueue } from '../lib/offline';

type Tab = 'servicios' | 'ventas';
type Brought = 'NONE' | 'TIRE' | 'OTHER';
type Method = 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
type Line = {
  key: string;
  kind: 'PRODUCT' | 'SERVICE';
  productId?: number;
  serviceId?: number;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stock?: number;
};
type Product = { id: number; sku: string; barcode: string | null; name: string; price: number; cost: number; stock: number; category: string | null; unit?: string; sold?: number };
type Service = { id: number; code: string; name: string; price: number; cost: number; description: string | null };
type CustomerHit = { id: number; name: string; phone: string | null; plate: string | null; vehicle: string | null };
type Cash = { id: number; registerName: string; branchName: string; openingAmount: number } | null;

const genericCustomer = { customerId: null as number | null, customerName: 'Cliente general', phone: '', plate: '', vehicle: 'General' };

export function PosPage() {
  const toasts = useToasts();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('servicios');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [cash, setCash] = useState<Cash>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [top, setTop] = useState<Product[]>([]);
  const [detail, setDetail] = useState<Product | null>(null);
  const [searching, setSearching] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', plate: '', vehicle: '' });
  const [saleCart, setSaleCart] = useState<Line[]>([]);
  const [serviceCart, setServiceCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState(genericCustomer);
  const [discount, setDiscount] = useState(0);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<Method>('CASH');
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const cart = tab === 'servicios' ? serviceCart : saleCart;
  const setCart = tab === 'servicios' ? setServiceCart : setSaleCart;
  const totals = useMemo(
    () => quote(cart, discount, company?.taxRate ?? 15, company?.pricesIncludeTax ?? true),
    [cart, discount, company],
  );

  useEffect(() => {
    api<CompanyInfo>('/api/settings').then(setCompany).catch(() => undefined);
    api<Cash>('/api/cash/current').then(setCash).catch(() => setCash(null));
    api<{ items: Service[] }>('/api/services?pageSize=50').then((page) => {
      setServices(page.items);
      void cachePut('services', page.items);
    }).catch(async () => {
      const cached = await cacheGet<Service[]>('services');
      if (cached) setServices(cached);
    });
    api<Product[]>('/api/products/top').then(setTop).catch(() => setTop([]));
  }, []);

  useEffect(() => {
    const orderToOpen = (location.state as { orderId?: number } | null)?.orderId;
    if (!orderToOpen) return;
    api<OrderResponse>(`/api/orders/${orderToOpen}`).then((order) => {
      setTab('servicios');
      setOrderId(order.id);
      setOrderNumber(order.number);
      setCustomer({
        customerId: order.customerId,
        customerName: order.customerName || genericCustomer.customerName,
        phone: order.phone || '',
        plate: order.plate || '',
        vehicle: order.vehicle || genericCustomer.vehicle,
      });
      setDiscount(order.discount);
      setServiceCart(order.lines.map((line) => ({
        key: `${line.kind}-${line.productId || line.serviceId}`,
        kind: line.kind,
        productId: line.productId || undefined,
        serviceId: line.serviceId || undefined,
        code: line.code,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        stock: line.kind === 'PRODUCT' && line.stock != null ? line.stock : undefined,
      })));
      navigate('/ventas', { replace: true });
    }).catch((err: Error) => toasts.err(err.message));
  }, [location.state]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      api<{ items: Product[] }>(`/api/products${qs({ q: term, pageSize: 12 })}`)
        .then((page) => {
          setResults(page.items);
          void cachePut('products', page.items);
        })
        .catch(async () => {
          const cached = (await cacheGet<Product[]>('products')) || [];
          const needle = term.toLowerCase();
          setResults(cached.filter((item) => `${item.name} ${item.sku} ${item.barcode || ''}`.toLowerCase().includes(needle)).slice(0, 12));
        })
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const term = customerQuery.trim();
    if (term.length < 2) {
      setCustomerHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api<{ items: CustomerHit[] }>(`/api/customers${qs({ q: term, pageSize: 6 })}`)
        .then((page) => setCustomerHits(page.items))
        .catch(() => setCustomerHits([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [customerQuery]);

  function addLine(line: Line) {
    setCart((current) => {
      const found = current.find((item) => item.key === line.key);
      if (!found) {
        if (line.kind === 'PRODUCT' && line.stock != null && line.quantity > line.stock) {
          toasts.err(line.stock > 0 ? `Solo hay ${line.stock} de ${line.name}` : `${line.name} no tiene existencia`);
          return current;
        }
        return [...current, line];
      }
      const cap = found.stock ?? line.stock;
      const quantity = roundMoney(found.quantity + line.quantity);
      if (line.kind === 'PRODUCT' && cap != null && quantity > cap) {
        toasts.err(cap > 0 ? `Solo hay ${cap} de ${line.name}` : `${line.name} no tiene existencia`);
        return current;
      }
      return current.map((item) => (item.key === line.key ? { ...item, quantity, stock: cap ?? item.stock } : item));
    });
    setQuery('');
    setResults([]);
  }

  function addProduct(product: Product) {
    if (product.stock <= 0) {
      toasts.err(`${product.name} no tiene existencia`);
      return;
    }
    addLine({
      key: `PRODUCT-${product.id}`,
      kind: 'PRODUCT',
      productId: product.id,
      code: product.sku,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
      stock: product.stock,
    });
  }

  function onSearchKey(key: string) {
    if (key !== 'Enter') return;
    const exact = results.find((item) => item.barcode === query.trim() || item.sku.toLowerCase() === query.trim().toLowerCase());
    if (exact) addProduct(exact);
    else if (results.length === 1) addProduct(results[0]);
  }

  function applyCustomer(hit: CustomerHit) {
    setCustomer({
      customerId: hit.id,
      customerName: hit.name,
      phone: hit.phone || '',
      plate: hit.plate || '',
      vehicle: hit.vehicle || '',
    });
    setCustomerQuery('');
    setCustomerHits([]);
    setAddingCustomer(false);
  }

  async function createCustomer() {
    if (newCustomer.name.trim().length < 2) {
      toasts.err('Escriba el nombre del cliente');
      return;
    }
    try {
      const saved = await api<CustomerHit>('/api/customers', { method: 'POST', body: JSON.stringify(newCustomer) });
      applyCustomer(saved);
      setNewCustomer({ name: '', phone: '', plate: '', vehicle: '' });
      toasts.ok('Cliente agregado a esta venta');
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo agregar el cliente');
    }
  }

  function payload() {
    return {
      ...customer,
      customerName: customer.customerName.trim() || genericCustomer.customerName,
      brought: 'NONE' as const,
      broughtNote: '',
      discount,
      lines: cart.map((line) => ({
        kind: line.kind,
        productId: line.productId,
        serviceId: line.serviceId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    };
  }

  function stockLimit(lines: Line[]) {
    for (const line of lines) {
      if (line.kind === 'PRODUCT' && line.stock != null && line.quantity - line.stock > 0.001) {
        return line.stock > 0 ? `Solo hay ${line.stock} de ${line.name}` : `${line.name} no tiene existencia`;
      }
    }
    return '';
  }

  function validate() {
    if (!cart.length) return 'Agregue un servicio o un producto';
    const stockMessage = stockLimit(cart);
    if (stockMessage) return stockMessage;
    if (!cash) return 'Abra la caja antes de cobrar';
    return '';
  }

  async function saveOpen() {
    const message = cart.length ? stockLimit(cart) : 'Agregue un servicio o un producto';
    if (message) {
      setError(message);
      toasts.err(message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = orderId
        ? await api<OrderResponse>(`/api/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(payload()) })
        : await api<OrderResponse>('/api/orders', { method: 'POST', body: JSON.stringify(payload()) });
      setOrderId(saved.id);
      setOrderNumber(saved.number);
      toasts.ok(`Orden ${saved.number} guardada. Total ${money(saved.total, company?.currency)}`);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'No se pudo guardar la orden';
      setError(text);
      toasts.err(text);
    } finally {
      setBusy(false);
    }
  }

  async function charge() {
    const message = validate();
    if (message) {
      setError(message);
      toasts.err(message);
      return;
    }
    const paid = method === 'CASH' ? cashAmount : method === 'CARD' ? totals.total : method === 'TRANSFER' ? totals.total : roundMoney(cashAmount + cardAmount + transferAmount);
    if (method === 'CASH' && cashAmount + 0.009 < totals.total) {
      setError('El efectivo no cubre el total');
      return;
    }
    if (method === 'MIXED' && Math.abs(paid - totals.total) > 0.05) {
      setError('El pago mixto debe sumar el total');
      return;
    }
    setBusy(true);
    setError('');
    const payment = {
      ...payload(),
      pay: true,
      paymentMethod: method,
      cashAmount: method === 'CARD' || method === 'TRANSFER' ? 0 : cashAmount,
      cardAmount: method === 'CARD' ? totals.total : method === 'MIXED' ? cardAmount : 0,
      transferAmount: method === 'TRANSFER' ? totals.total : method === 'MIXED' ? transferAmount : 0,
    };
    const clientUuid = crypto.randomUUID();
    try {
      const saved = tab === 'ventas'
        ? await api<SaleResponse>('/api/sales', { method: 'POST', body: JSON.stringify({ ...payment, clientUuid }) })
        : orderId
          ? await api<OrderResponse>(`/api/orders/${orderId}/pay`, { method: 'POST', body: JSON.stringify(payment) })
          : await api<OrderResponse>('/api/orders', { method: 'POST', body: JSON.stringify({ ...payment, clientUuid }) });
      finish(saved);
      toasts.ok('Cobro registrado');
    } catch (err) {
      if (err instanceof NetworkError) {
        const path = tab === 'ventas' ? '/api/sales' : orderId ? `/api/orders/${orderId}/pay` : '/api/orders';
        await enqueue(path, { ...payment, clientUuid });
        finish({
          number: 0,
          createdAt: new Date().toISOString(),
          cashierName: 'Este dispositivo',
          customerName: payment.customerName,
          phone: customer.phone,
          plate: customer.plate,
          vehicle: customer.vehicle,
          brought: 'NONE',
          broughtNote: '',
          lines: cart.map((line) => ({ name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, amount: roundMoney(line.quantity * line.unitPrice) })),
          ...totals,
          paymentMethod: method,
          cashAmount: payment.cashAmount,
          cardAmount: payment.cardAmount,
          transferAmount: payment.transferAmount,
          changeAmount: method === 'CASH' ? roundMoney(cashAmount - totals.total) : 0,
        });
        toasts.info('Sin conexión. El cobro quedó en este dispositivo y se enviará al volver la red.');
      } else {
        const text = err instanceof Error ? err.message : 'No se pudo cobrar';
        setError(text);
        toasts.err(text);
      }
    } finally {
      setBusy(false);
    }
  }

  function finish(saved: SaleResponse | OrderResponse | ReceiptData) {
    const lines = 'lines' in saved && saved.lines ? saved.lines : 'items' in saved ? saved.items : cart.map((line) => ({ name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, amount: roundMoney(line.quantity * line.unitPrice) }));
    setReceipt({
      number: saved.number,
      createdAt: 'createdAt' in saved ? saved.createdAt : new Date().toISOString(),
      cashierName: saved.cashierName,
      customerName: saved.customerName,
      phone: 'phone' in saved ? saved.phone : customer.phone,
      plate: saved.plate,
      vehicle: saved.vehicle,
      brought: 'brought' in saved ? saved.brought : 'NONE',
      broughtNote: 'broughtNote' in saved ? saved.broughtNote : '',
      lines: lines.map((line) => ({ name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.amount })),
      subtotal: saved.subtotal,
      discount: saved.discount,
      tax: saved.tax,
      total: saved.total,
      paymentMethod: saved.paymentMethod,
      cashAmount: saved.cashAmount,
      cardAmount: saved.cardAmount,
      transferAmount: saved.transferAmount,
      changeAmount: saved.changeAmount,
    });
    setPayOpen(false);
    setCartOpen(false);
    setSaleCart([]);
    setServiceCart([]);
    setCustomer(genericCustomer);
    setDiscount(0);
    setOrderId(null);
    setOrderNumber(null);
    setCashAmount(0);
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-4">
      <section className="space-y-3 pb-28 lg:pb-0">
        <div className="grid grid-cols-2 rounded-full bg-white p-1 shadow-sm">
          {(['servicios', 'ventas'] as Tab[]).map((item) => (
            <button key={item} className={`min-h-12 rounded-full font-bold ${tab === item ? 'bg-ink text-white' : 'text-ink'}`} type="button" onClick={() => { setTab(item); setDiscount(0); setError(''); }}>
              {item === 'servicios' ? 'Servicios' : 'Ventas'}
            </button>
          ))}
        </div>
        {!cash ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            La caja está cerrada. <Link className="underline" to="/caja">Abrir caja</Link>
          </div>
        ) : <p className="text-sm text-muted">{cash.registerName} abierta</p>}
        <CustomerPicker
          customer={customer}
          setCustomer={setCustomer}
          query={customerQuery}
          setQuery={setCustomerQuery}
          hits={customerHits}
          onPick={applyCustomer}
          adding={addingCustomer}
          setAdding={setAddingCustomer}
          draft={newCustomer}
          setDraft={setNewCustomer}
          onCreate={() => void createCustomer()}
        />
        {tab === 'servicios' ? (
          <div className="space-y-3 rounded-[28px] bg-white p-4 shadow-sm">
            {orderNumber ? <p className="text-sm font-bold">Editando orden {orderNumber}</p> : null}
            <div className="rounded-2xl bg-ink p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">Total del servicio</p>
              <p className="text-3xl font-black">{money(totals.total, company?.currency)}</p>
              <p className="text-xs text-white/60">Subtotal {money(totals.subtotal, company?.currency)} · descuento {money(totals.discount, company?.currency)} · IVA {money(totals.tax, company?.currency)}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {services.filter((item) => item).map((service) => (
                <button key={service.id} type="button" className="min-w-36 shrink-0 rounded-2xl bg-canvas px-3 py-3 text-left" onClick={() => addLine({ key: `SERVICE-${service.id}`, kind: 'SERVICE', serviceId: service.id, code: service.code, name: service.name, quantity: 1, unitPrice: service.price })}>
                  <span className="block text-sm font-bold text-ink">{service.name}</span>
                  <span className="text-sm font-black">{money(service.price, company?.currency)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-[28px] bg-white p-3 shadow-sm">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted" />
            <input
              className="min-h-12 w-full rounded-2xl bg-canvas py-2 pl-10 pr-3"
              placeholder={tab === 'servicios' ? 'Buscar producto para el servicio' : 'Buscar por nombre, SKU o código'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => onSearchKey(event.key)}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <h2 className="font-bold">{query.trim().length >= 2 ? 'Resultados' : top.some((item) => item.sold) ? 'Más vendidos' : 'Productos'}</h2>
            {searching ? <span className="text-xs text-muted">Buscando...</span> : null}
          </div>
          <ProductTable
            rows={query.trim().length >= 2 ? results : top}
            currency={company?.currency}
            empty={query.trim().length >= 2 ? 'No hay productos con ese dato.' : 'Todavía no hay productos.'}
            onOpen={setDetail}
          />
        </div>
        <ErrorText>{error}</ErrorText>
      </section>
      <aside className="mt-3 hidden lg:block">
        <CartPanel
          cart={cart}
          currency={company?.currency}
          totals={totals}
          discount={discount}
          setDiscount={setDiscount}
          setCart={setCart}
          onSave={tab === 'servicios' ? saveOpen : undefined}
          onPay={() => { setCashAmount(totals.total); setPayOpen(true); }}
          busy={busy}
          toasts={toasts}
        />
      </aside>
      <div className="fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <button className="flex min-h-14 w-full items-center justify-between rounded-full bg-lime px-5 text-ink shadow-lg" type="button" onClick={() => setCartOpen(true)}>
          <span className="font-bold">{cart.length} ítems</span>
          <span className="text-lg font-black">{money(totals.total, company?.currency)}</span>
        </button>
      </div>
      {cartOpen ? (
        <div className="fixed inset-0 z-50 bg-navy/40 lg:hidden" onClick={() => setCartOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-auto rounded-t-3xl bg-canvas p-4 pb-[env(safe-area-inset-bottom)]" onClick={(event) => event.stopPropagation()}>
            <CartPanel cart={cart} currency={company?.currency} totals={totals} discount={discount} setDiscount={setDiscount} setCart={setCart} onSave={tab === 'servicios' ? saveOpen : undefined} onPay={() => { setCashAmount(totals.total); setPayOpen(true); }} busy={busy} toasts={toasts} />
          </div>
        </div>
      ) : null}
      {payOpen ? (
        <Modal title="Cobrar" onClose={() => setPayOpen(false)}>
          <p className="text-3xl font-black text-navy">{money(totals.total, company?.currency)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(['CASH', 'CARD', 'TRANSFER', 'MIXED'] as Method[]).map((item) => (
              <button key={item} type="button" className={`min-h-12 rounded-full font-bold ${method === item ? 'bg-ink text-white' : 'bg-canvas text-ink'}`} onClick={() => { setMethod(item); setCashAmount(item === 'CASH' ? totals.total : 0); setCardAmount(0); setTransferAmount(0); }}>
                {PAYMENT_LABEL[item]}
              </button>
            ))}
          </div>
          {method === 'CASH' || method === 'MIXED' ? <Amount label="Efectivo" value={cashAmount} onChange={setCashAmount} /> : null}
          {method === 'MIXED' ? <Amount label="Tarjeta" value={cardAmount} onChange={setCardAmount} /> : null}
          {method === 'MIXED' ? <Amount label="Transferencia" value={transferAmount} onChange={setTransferAmount} /> : null}
          {method === 'CASH' ? <p className="mt-2 text-sm font-semibold text-ink">Cambio {money(Math.max(0, cashAmount - totals.total), company?.currency)}</p> : null}
          <ErrorText>{error}</ErrorText>
          <PrimaryButton className="mt-4 w-full" disabled={busy} onClick={() => void charge()}>{busy ? 'Cobrando...' : 'Confirmar cobro'}</PrimaryButton>
        </Modal>
      ) : null}
      {detail ? (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">SKU</dt><dd className="font-bold">{detail.sku}</dd></div>
            <div><dt className="text-muted">Código</dt><dd className="font-bold">{detail.barcode || 'Sin código'}</dd></div>
            <div><dt className="text-muted">Categoría</dt><dd className="font-bold">{detail.category || 'General'}</dd></div>
            <div><dt className="text-muted">Existencia</dt><dd className="font-bold">{detail.stock}</dd></div>
            <div><dt className="text-muted">Precio</dt><dd className="text-lg font-black">{money(detail.price, company?.currency)}</dd></div>
            {detail.sold ? <div><dt className="text-muted">Vendidos</dt><dd className="font-bold">{detail.sold}</dd></div> : null}
          </dl>
          <PrimaryButton className="mt-4 w-full" onClick={() => { addProduct(detail); setDetail(null); }}>Agregar a la cuenta</PrimaryButton>
        </Modal>
      ) : null}
      {receipt && company ? (
        <Modal title={receipt.number ? 'Boucher listo' : 'Cobro guardado en el dispositivo'} onClose={() => setReceipt(null)}>
          <div className="max-h-[50vh] overflow-auto rounded-2xl border border-line">
            <Receipt company={company} receipt={receipt} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <PrimaryButton onClick={() => window.print()}>Imprimir</PrimaryButton>
            <button className="min-h-12 rounded-2xl bg-canvas font-bold text-navy" type="button" onClick={() => setReceipt(null)}>Nueva venta</button>
          </div>
        </Modal>
      ) : null}
      {busy ? <div className="fixed bottom-24 right-4 z-40 hidden rounded-full bg-white p-3 shadow lg:block"><Spinner /></div> : null}
    </div>
  );
}

function CustomerPicker({
  customer,
  setCustomer,
  query,
  setQuery,
  hits,
  onPick,
  adding,
  setAdding,
  draft,
  setDraft,
  onCreate,
}: {
  customer: typeof genericCustomer;
  setCustomer: (value: typeof genericCustomer) => void;
  query: string;
  setQuery: (value: string) => void;
  hits: CustomerHit[];
  onPick: (hit: CustomerHit) => void;
  adding: boolean;
  setAdding: (value: boolean) => void;
  draft: { name: string; phone: string; plate: string; vehicle: string };
  setDraft: (value: { name: string; phone: string; plate: string; vehicle: string }) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-3 rounded-[28px] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Cliente</p>
          <p className="font-black">{customer.customerName}</p>
        </div>
        <button type="button" className="min-h-10 rounded-full bg-canvas px-3 text-sm font-bold" onClick={() => { setCustomer(genericCustomer); setQuery(''); setAdding(false); }}>
          General
        </button>
      </div>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-muted" />
        <input className="min-h-12 w-full rounded-2xl bg-canvas py-2 pl-10 pr-3" placeholder="Buscar cliente por nombre, placa o teléfono" value={query} onChange={(event) => setQuery(event.target.value)} />
        {hits.length ? (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-line bg-white shadow-lg">
            {hits.map((hit) => (
              <button key={hit.id} type="button" className="block min-h-12 w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => onPick(hit)}>
                <span className="block font-bold">{hit.name}</span>
                <span className="text-xs text-muted">{[hit.plate, hit.phone, hit.vehicle].filter(Boolean).join(' · ') || 'Sin más datos'}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre en el boucher" value={customer.customerName} onChange={(value) => setCustomer({ ...customer, customerId: null, customerName: value })} />
        <Field label="Teléfono" value={customer.phone} onChange={(value) => setCustomer({ ...customer, phone: value })} />
        <Field label="Placa" value={customer.plate} onChange={(value) => setCustomer({ ...customer, plate: value.toUpperCase() })} />
        <Field label="Vehículo" value={customer.vehicle} onChange={(value) => setCustomer({ ...customer, vehicle: value })} />
      </div>
      {adding ? (
        <div className="grid gap-3 rounded-2xl bg-canvas p-3 sm:grid-cols-2">
          <Field label="Nombre nuevo" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          <Field label="Teléfono" value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} />
          <Field label="Placa" value={draft.plate} onChange={(value) => setDraft({ ...draft, plate: value.toUpperCase() })} />
          <Field label="Vehículo" value={draft.vehicle} onChange={(value) => setDraft({ ...draft, vehicle: value })} />
          <PrimaryButton className="sm:col-span-2" onClick={onCreate}>Guardar y usar</PrimaryButton>
        </div>
      ) : (
        <button type="button" className="flex min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-sm font-bold" onClick={() => setAdding(true)}>
          <Icon name="plus" className="h-4 w-4" /> Agregar cliente
        </button>
      )}
    </div>
  );
}

function ProductTable({ rows, currency, empty, onOpen }: { rows: Product[]; currency?: string; empty: string; onOpen: (product: Product) => void }) {
  return (
    <TableWrap>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3">Producto</th>
            <th>Exist.</th>
            <th className="pr-3 text-right">Precio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product.id} className="border-t border-line">
              <td className="px-1 py-1">
                <button type="button" className="min-h-14 w-full rounded-xl px-2 text-left active:bg-canvas" onClick={() => onOpen(product)}>
                  <span className="block font-bold">{product.name}</span>
                  <span className="text-xs text-muted">{product.sku}{product.sold ? ` · ${product.sold} vendidos` : ''}</span>
                </button>
              </td>
              <td className={product.stock <= 0 ? 'font-bold text-red-600' : ''}>{product.stock}</td>
              <td className="pr-3 text-right font-black">{money(product.price, currency)}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td className="px-3 py-4 text-muted" colSpan={3}>{empty}</td></tr> : null}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Amount({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="mt-3 block text-sm font-semibold">
      {label}
      <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" inputMode="decimal" value={value || ''} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function CartPanel({
  cart,
  currency,
  totals,
  discount,
  setDiscount,
  setCart,
  onSave,
  onPay,
  busy,
  toasts,
}: {
  cart: Line[];
  currency?: string;
  totals: { subtotal: number; discount: number; tax: number; total: number };
  discount: number;
  setDiscount: (value: number) => void;
  setCart: React.Dispatch<React.SetStateAction<Line[]>>;
  onSave?: () => void;
  onPay: () => void;
  busy: boolean;
  toasts: { err: (message: string) => void };
}) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-black text-navy">Cuenta</h2>
      <div className="mt-3 space-y-3">
        {cart.map((line) => (
          <div key={line.key} className="rounded-2xl bg-canvas p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-navy">{line.name}{line.kind === 'PRODUCT' && line.stock != null ? <span className="mt-0.5 block text-xs font-semibold text-muted">Hay {line.stock}</span> : null}</p>
              <button type="button" className="text-sm font-bold text-red-600" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Quitar</button>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
              <div className="flex items-center rounded-xl bg-white">
                <button type="button" className="h-11 w-10 font-bold" onClick={() => setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.max(1, roundMoney(item.quantity - 1)) } : item))}>−</button>
                <span className="w-8 text-center font-bold">{line.quantity}</span>
                <button type="button" className="h-11 w-10 font-bold" onClick={() => {
                  const quantity = roundMoney(line.quantity + 1);
                  if (line.kind === 'PRODUCT' && line.stock != null && quantity - line.stock > 0.001) {
                    toasts.err(line.stock > 0 ? `Solo hay ${line.stock} de ${line.name}` : `${line.name} no tiene existencia`);
                    return;
                  }
                  setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity } : item));
                }}>+</button>
              </div>
              <input className="min-h-11 rounded-xl border border-line px-2" inputMode="decimal" value={line.unitPrice} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, unitPrice: Number(event.target.value) || 0 } : item))} />
            </div>
          </div>
        ))}
        {!cart.length ? <p className="text-sm text-muted">La cuenta está vacía.</p> : null}
      </div>
      <label className="mt-3 block text-sm font-semibold">
        Descuento C$
        <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" inputMode="decimal" value={discount || ''} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <div className="mt-3 space-y-1 text-sm">
        <p className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal, currency)}</span></p>
        <p className="flex justify-between"><span>Descuento</span><span>{money(totals.discount, currency)}</span></p>
        <p className="flex justify-between"><span>IVA</span><span>{money(totals.tax, currency)}</span></p>
        <p className="flex justify-between text-xl font-black text-navy"><span>Total</span><span>{money(totals.total, currency)}</span></p>
      </div>
      <div className="mt-3 grid gap-2">
        {onSave ? (
          <div>
            <button className="min-h-12 w-full rounded-2xl bg-canvas font-bold text-navy" type="button" disabled={busy} onClick={onSave}>Guardar orden</button>
            <p className="mt-1 text-center text-xs text-muted">No cobra ni cierra la caja. Deja el servicio pendiente en Órdenes.</p>
          </div>
        ) : null}
        <PrimaryButton disabled={busy || !cart.length} onClick={onPay}>Cobrar</PrimaryButton>
      </div>
    </div>
  );
}

type SaleResponse = ReceiptData & { items: ReceiptData['lines'] };
type OrderResponse = Omit<ReceiptData, 'lines'> & {
  id: number;
  customerId: number | null;
  brought: Brought;
  lines: Array<{
    kind: 'PRODUCT' | 'SERVICE';
    productId: number | null;
    serviceId: number | null;
    code: string;
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    stock?: number | null;
  }>;
};

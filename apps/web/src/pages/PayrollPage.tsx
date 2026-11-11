import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';
import { money, PAYMENT_LABEL, prettyDate, ymd } from '../lib/format';

type Worker = {
  userId: number | null;
  name: string;
  role: 'ADMIN' | 'CASHIER' | null;
  salesTotal: number;
  serviceTotal: number;
  total: number;
  paid: number;
  documents: number;
};
type Workers = { items: Worker[]; summary: { total: number; paid: number; workers: number } };
type Payment = {
  id: number;
  userId: number;
  workerName: string;
  paidByName: string;
  paidAt: string;
  periodFrom: string;
  periodTo: string;
  kind: string;
  method: string;
  amount: number;
  notes: string | null;
  locked: boolean;
};
type PaymentPage = { items: Payment[]; total: number; page: number; pages: number; summary: { total: number }; pageSubtotal: number };
type DueService = { name: string; quantity: number; rate: number; commission: number };
type Due = { userId: number; amount: number; lines: number; services: DueService[] };

const KIND_LABEL: Record<string, string> = {
  SALARY: 'Salario',
  ADVANCE: 'Adelanto',
  COMMISSION: 'Comisión',
  BONUS: 'Bono',
};

export function PayrollPage() {
  const toasts = useToasts();
  const today = ymd();
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [workers, setWorkers] = useState<Workers | null>(null);
  const [payments, setPayments] = useState<PaymentPage | null>(null);
  const [due, setDue] = useState<Due[]>([]);
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState<{ userId: number; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('SALARY');
  const [method, setMethod] = useState('CASH');
  const [paidAt, setPaidAt] = useState(today);
  const [notes, setNotes] = useState('');

  function load(next = page, range = { from, to }) {
    api<Workers>(`/api/reports/workers${qs(range)}`).then(setWorkers).catch((err: Error) => toasts.err(err.message));
    api<PaymentPage>(`/api/payroll${qs({ ...range, page: next, pageSize: 8 })}`).then(setPayments).catch((err: Error) => toasts.err(err.message));
    api<{ items: Due[] }>('/api/payroll/due').then((result) => setDue(result.items)).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(1); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!pay?.userId) return;
    try {
      await api('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({ userId: pay.userId, amount: Number(amount), paidAt, periodFrom: from, periodTo: to, kind, method, notes }),
      });
      toasts.ok('Pago registrado');
      setPay(null);
      setAmount('');
      setNotes('');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    }
  }

  function openPay(userId: number, name: string) {
    const pending = due.find((item) => item.userId === userId);
    setPay({ userId, name });
    setPaidAt(ymd());
    setKind('COMMISSION');
    setMethod('CASH');
    setNotes('');
    setAmount(pending && pending.amount > 0 ? String(pending.amount) : '');
  }

  async function remove(id: number) {
    try {
      await api(`/api/payroll/${id}`, { method: 'DELETE' });
      toasts.ok('Pago anulado');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo anular');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-navy">Planilla</h1>
      <p className="text-sm text-muted">El pago sale de los servicios cobrados que todavía no se le han pagado. Al registrarlo, esos servicios quedan liquidados y el siguiente pago solo toma los nuevos.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold">Desde<input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-white px-3" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">Hasta<input className="mt-1 min-h-12 w-full rounded-2xl border border-line bg-white px-3" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <PrimaryButton onClick={() => { setPage(1); load(1, { from, to }); }}>Consultar</PrimaryButton>
      </div>
      {workers ? <StatGrid items={[{ label: 'Trabajadores', value: String(workers.summary.workers) }, { label: 'A pagar', value: money(due.reduce((sum, item) => sum + item.amount, 0)) }, { label: 'Pagado', value: money(workers.summary.paid) }]} /> : null}
      <TableWrap>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Trabajador</th><th>Servicios</th><th>A pagar</th><th>Pagado</th><th></th></tr></thead>
          <tbody>
            {workers?.items.filter((row) => row.userId).map((row) => {
              const pending = due.find((item) => item.userId === row.userId);
              return (
                <tr key={row.userId} className="border-t border-line align-top">
                  <td className="px-4 py-3 font-bold">{row.name}</td>
                  <td className="py-3">
                    {pending?.services.length ? pending.services.map((service) => (
                      <span key={`${service.name}-${service.rate}`} className="block">{service.name} × {service.quantity}</span>
                    )) : <span className="text-muted">Sin servicios por pagar</span>}
                  </td>
                  <td className="py-3 font-bold">{money(pending?.amount || 0)}</td>
                  <td className="py-3">{money(row.paid)}</td>
                  <td className="py-3"><button className="min-h-11 rounded-full bg-lime px-4 text-sm font-bold text-ink" type="button" onClick={() => openPay(row.userId as number, row.name)}>Pagar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-bold text-navy">Pagos registrados</h2>
          {payments ? <p className="text-sm text-muted">Página {money(payments.pageSubtotal)} · período {money(payments.summary.total)}</p> : null}
        </div>
        <TableWrap>
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Fecha</th><th>Trabajador</th><th>Concepto</th><th>Período</th><th>Monto</th><th></th></tr></thead>
            <tbody>
              {payments?.items.length ? payments.items.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{prettyDate(row.paidAt)}<br /><span className="text-xs text-muted">{row.paidByName}</span></td>
                  <td className="font-bold">{row.workerName}</td>
                  <td>{KIND_LABEL[row.kind] || row.kind}<br /><span className="text-xs text-muted">{PAYMENT_LABEL[row.method]}{row.notes ? ` · ${row.notes}` : ''}</span></td>
                  <td>{prettyDate(row.periodFrom)} – {prettyDate(row.periodTo)}</td>
                  <td className="font-bold">{money(row.amount)}</td>
                  <td>{row.locked ? <span className="text-xs text-muted">En caja cerrada</span> : <button className="font-bold text-red-600" type="button" onClick={() => void remove(row.id)}>Anular</button>}</td>
                </tr>
              )) : <tr><td className="px-4 py-6 text-muted" colSpan={6}>Todavía no hay pagos en este período.</td></tr>}
            </tbody>
          </table>
        </TableWrap>
        {payments ? <Pager page={payments.page} pages={payments.pages} total={payments.total} onPage={(next) => { setPage(next); load(next); }} /> : null}
      </section>
      {pay ? (
        <Modal title={`Pagar a ${pay.name}`} onClose={() => setPay(null)}>
          <form onSubmit={save} className="grid gap-3">
            <ServiceDue due={due.find((item) => item.userId === pay.userId)} kind={kind} />
            <p className="text-sm text-muted">Si elige efectivo y usted tiene la caja abierta, el monto sale de esa caja.</p>
            <label className="text-sm font-semibold">Monto
              <input className={`${controlClass} mt-1`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </label>
            <label className="text-sm font-semibold">Concepto
              <select className={`${controlClass} mt-1`} value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="SALARY">Salario</option>
                <option value="ADVANCE">Adelanto</option>
                <option value="COMMISSION">Comisión</option>
                <option value="BONUS">Bono</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Forma de pago
              <select className={`${controlClass} mt-1`} value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="CARD">Tarjeta</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Fecha del pago
              <input className={`${controlClass} mt-1`} type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
            <label className="text-sm font-semibold">Nota
              <input className={`${controlClass} mt-1`} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <PrimaryButton>Registrar pago</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function ServiceDue({ due, kind }: { due?: Due; kind: string }) {
  if (!due?.services.length) {
    return <p className="rounded-2xl bg-canvas px-3 py-2 text-sm text-ink">No hay servicios pendientes. El monto fijo se pone en cada servicio, y aquí solo entran los que ya se cobraron y todavía no se han pagado.</p>;
  }
  return (
    <div className="space-y-2 rounded-2xl bg-canvas px-3 py-3 text-sm">
      {due.services.map((service) => (
        <p key={`${service.name}-${service.rate}`}>
          <span className="font-semibold">{service.name} × {service.quantity}</span>
          <span className="text-muted"> · {money(service.commission)}</span>
        </p>
      ))}
      <p className="font-bold">Total calculado {money(due.amount)}</p>
      <p className="text-muted">{kind === 'COMMISSION' ? 'Al registrar esta comisión se liquidan estos servicios. El siguiente pago solo cuenta los nuevos.' : 'Con este concepto no se liquidan los servicios. Para cerrarlos, elija Comisión.'}</p>
    </div>
  );
}

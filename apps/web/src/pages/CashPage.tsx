import { useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { ErrorText, Modal, Pager, PrimaryButton, StatGrid, TableWrap } from '../components/ui';
import { api, qs } from '../lib/api';
import { money, prettyTime } from '../lib/format';

type Session = {
  id: number;
  status: string;
  registerId: number;
  registerName: string;
  branchName: string;
  openingAmount: number;
  cashIn?: number;
  payroll?: number;
  card?: number;
  transfer?: number;
  sold?: number;
  expected?: number;
  counted?: number;
  difference?: number;
  openedAt: string;
  closedAt?: string | null;
  notes?: string | null;
};
type Register = { id: number; name: string; active: boolean; branchId: number };
type Branch = { id: number; name: string; registers: Register[] };
type History = { items: Session[]; total: number; page: number; pages: number; summary: { closed: number; difference: number } };

export function CashPage() {
  const toasts = useToasts();
  const [current, setCurrent] = useState<Session | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registerId, setRegisterId] = useState(0);
  const [opening, setOpening] = useState(0);
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  function load() {
    api<Session | null>('/api/cash/current').then(setCurrent).catch((err: Error) => setError(err.message));
    api<History>(`/api/cash/history${qs({ page, pageSize: 8 })}`).then(setHistory).catch(() => undefined);
  }
  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    api<Branch[]>('/api/branches').then((rows) => {
      setBranches(rows);
      const first = rows.flatMap((branch) => branch.registers).find((register) => register.active);
      if (first) setRegisterId(first.id);
    }).catch(() => undefined);
  }, []);

  async function open() {
    try {
      const session = await api<Session>('/api/cash/open', { method: 'POST', body: JSON.stringify({ registerId, openingAmount: opening }) });
      setCurrent(session);
      toasts.ok('Caja abierta');
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo abrir la caja');
    }
  }

  async function close() {
    try {
      await api('/api/cash/close', { method: 'POST', body: JSON.stringify({ countedAmount: counted, notes }) });
      setCloseOpen(false);
      setCurrent(null);
      toasts.ok('Caja cerrada y arqueada');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    }
  }

  const registers = branches.flatMap((branch) => branch.registers.filter((register) => register.active).map((register) => ({ ...register, branch: branch.name })));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-navy">Caja</h1>
      <ErrorText>{error}</ErrorText>
      {current ? (
        <>
          <StatGrid items={[
            { label: 'Apertura', value: money(current.openingAmount), hint: current.registerName },
            { label: 'Efectivo vendido', value: money(current.cashIn || 0) },
            { label: 'Planilla en efectivo', value: money(current.payroll || 0) },
            { label: 'Esperado en caja', value: money(current.expected || 0) },
            { label: 'Tarjeta + transferencia', value: money((current.card || 0) + (current.transfer || 0)) },
          ]} />
          <PrimaryButton onClick={() => { setCounted(current.expected || 0); setCloseOpen(true); }}>Cerrar y arquear</PrimaryButton>
        </>
      ) : (
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="font-bold text-navy">Apertura</h2>
          <label className="mt-3 block text-sm font-semibold">Caja
            <select className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" value={registerId} onChange={(event) => setRegisterId(Number(event.target.value))}>
              {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold">Fondo inicial
            <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" inputMode="decimal" value={opening || ''} onChange={(event) => setOpening(Number(event.target.value) || 0)} />
          </label>
          <PrimaryButton className="mt-4" onClick={() => void open()}>Abrir caja</PrimaryButton>
        </div>
      )}
      <h2 className="font-bold text-navy">Arqueos anteriores</h2>
      {history ? <StatGrid items={[{ label: 'Cierres', value: String(history.summary.closed) }, { label: 'Diferencia de esta página', value: money(history.summary.difference) }]} /> : null}
      <TableWrap>
        <table className="min-w-[680px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Caja</th><th>Cierre</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
          <tbody>
            {history?.items.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3">{row.registerName}</td>
                <td>{row.closedAt ? prettyTime(row.closedAt) : ''}</td>
                <td>{money(row.expected || 0)}</td>
                <td>{money(row.counted || 0)}</td>
                <td className={row.difference ? 'font-bold text-red-600' : ''}>{money(row.difference || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {history ? <Pager page={history.page} pages={history.pages} total={history.total} onPage={setPage} /> : null}
      {closeOpen && current ? (
        <Modal title="Arqueo de caja" onClose={() => setCloseOpen(false)}>
          <p className="text-sm text-ink/70">Esperado en efectivo: <strong>{money(current.expected || 0)}</strong></p>
          <label className="mt-3 block text-sm font-semibold">Efectivo contado
            <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" inputMode="decimal" value={counted || ''} onChange={(event) => setCounted(Number(event.target.value) || 0)} />
          </label>
          <p className="mt-2 font-bold">Diferencia {money(counted - (current.expected || 0))}</p>
          <textarea className="mt-3 min-h-24 w-full rounded-2xl border border-line p-3" placeholder="Nota del arqueo" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <PrimaryButton className="mt-4 w-full" onClick={() => void close()}>Confirmar cierre</PrimaryButton>
        </Modal>
      ) : null}
    </div>
  );
}

import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';
import { money } from '../lib/format';

type Service = { id: number; code: string; name: string; description: string | null; price: number; cost: number; workerAmount: number; active: boolean };
type Page = { items: Service[]; total: number; page: number; pages: number; summary: { active: number; average: number } };
const empty = { code: '', name: '', description: '', price: 0, cost: 0, workerAmount: 0, active: true };

export function ServicesPage() {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page | null>(null);
  const [form, setForm] = useState<typeof empty & { id?: number } | null>(null);

  function load(page = 1) {
    api<Page>(`/api/services${qs({ page, pageSize: 10, q, all: 1 })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(); }, [q]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      if (form.id) await api(`/api/services/${form.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await api('/api/services', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      toasts.ok('Servicio guardado');
      load(data?.page || 1);
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar el servicio');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-navy">Servicios</h1>
        <PrimaryButton onClick={() => setForm(empty)}>Nuevo servicio</PrimaryButton>
      </div>
      {data ? <StatGrid items={[{ label: 'Activos', value: String(data.summary.active) }, { label: 'Precio promedio', value: money(data.summary.average) }]} /> : null}
      <input className={controlClass} placeholder="Buscar servicio" value={q} onChange={(event) => setQ(event.target.value)} />
      <TableWrap>
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Código</th><th>Servicio</th><th>Costo</th><th>Precio</th><th>Trabajador</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.code}</td>
                <td>{item.name}<br /><span className="text-xs text-muted">{item.description}</span></td>
                <td>{money(item.cost)}</td>
                <td className="font-bold">{money(item.price)}</td>
                <td>{money(item.workerAmount || 0)}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => setForm({ ...item, description: item.description || '' })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={load} /> : null}
      {form ? (
        <Modal title={form.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid gap-3">
            <p className="rounded-2xl bg-canvas px-3 py-2 text-sm text-ink">{form.id ? `Código ${form.code}` : 'El código se asigna solo al guardar.'}</p>
            <label className="text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">Descripción<textarea className={`${controlClass} mt-1 min-h-20`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="text-sm font-semibold">Costo<input className={`${controlClass} mt-1`} inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) || 0 })} /></label>
            <label className="text-sm font-semibold">Precio al cliente<input className={`${controlClass} mt-1`} inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) || 0 })} /></label>
            <label className="text-sm font-semibold">Monto para el trabajador
              <input className={`${controlClass} mt-1`} inputMode="decimal" value={form.workerAmount} onChange={(event) => setForm({ ...form, workerAmount: Number(event.target.value) || 0 })} />
            </label>
            <p className="text-sm text-muted">Cada vez que se cobra este servicio, quien lo hizo suma {money(Number(form.workerAmount) || 0)}. Si lo hace dos veces, suma dos veces. En planilla el pago sale solo con los servicios que todavía no se le han pagado.</p>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Activo</label>
            <PrimaryButton>Guardar servicio</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';

type Customer = { id: number; name: string; phone: string | null; ruc: string | null; plate: string | null; vehicle: string | null; notes: string | null };
type Page = { items: Customer[]; total: number; page: number; pages: number; summary: { count: number } };
const empty = { name: '', phone: '', ruc: '', plate: '', vehicle: '', notes: '' };

export function CustomersPage() {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page | null>(null);
  const [form, setForm] = useState<typeof empty & { id?: number } | null>(null);
  function load(page = 1) {
    api<Page>(`/api/customers${qs({ page, pageSize: 10, q })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(); }, [q]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      if (form.id) await api(`/api/customers/${form.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await api('/api/customers', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      toasts.ok('Cliente guardado');
      load(data?.page || 1);
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-black text-navy">Clientes</h1><PrimaryButton onClick={() => setForm(empty)}>Nuevo</PrimaryButton></div>
      {data ? <StatGrid items={[{ label: 'Clientes', value: String(data.summary.count) }]} /> : null}
      <input className={controlClass} placeholder="Nombre, placa, teléfono o RUC" value={q} onChange={(event) => setQ(event.target.value)} />
      <TableWrap>
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Cliente</th><th>Placa</th><th>Vehículo</th><th>Teléfono</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.name}<br /><span className="text-xs text-muted">{item.ruc}</span></td>
                <td>{item.plate}</td><td>{item.vehicle}</td><td>{item.phone}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => setForm({ id: item.id, name: item.name, phone: item.phone || '', ruc: item.ruc || '', plate: item.plate || '', vehicle: item.vehicle || '', notes: item.notes || '' })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={load} /> : null}
      {form ? (
        <Modal title="Cliente" onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid gap-3">
            {(['name', 'phone', 'ruc', 'plate', 'vehicle'] as const).map((key) => (
              <label key={key} className="text-sm font-semibold capitalize">{key}<input className={`${controlClass} mt-1`} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
            ))}
            <PrimaryButton>Guardar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

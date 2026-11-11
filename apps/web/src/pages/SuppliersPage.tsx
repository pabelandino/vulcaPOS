import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { api, qs } from '../lib/api';

type Supplier = { id: number; name: string; contact: string | null; phone: string | null; ruc: string | null; address: string | null; email: string | null };
type Page = { items: Supplier[]; total: number; page: number; pages: number; summary: { count: number } };
const empty = { name: '', contact: '', phone: '', ruc: '', address: '', email: '' };

export function SuppliersPage() {
  const toasts = useToasts();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Page | null>(null);
  const [form, setForm] = useState<typeof empty & { id?: number } | null>(null);
  function load(page = 1) {
    api<Page>(`/api/suppliers${qs({ page, pageSize: 10, q })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(); }, [q]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      if (form.id) await api(`/api/suppliers/${form.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      else await api('/api/suppliers', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      toasts.ok('Proveedor guardado');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black text-navy">Proveedores</h1><PrimaryButton onClick={() => setForm(empty)}>Nuevo</PrimaryButton></div>
      {data ? <StatGrid items={[{ label: 'Proveedores', value: String(data.summary.count) }]} /> : null}
      <input className={controlClass} placeholder="Buscar proveedor" value={q} onChange={(event) => setQ(event.target.value)} />
      <TableWrap>
        <table className="min-w-[680px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Proveedor</th><th>Contacto</th><th>Teléfono</th><th>RUC</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.name}</td><td>{item.contact}</td><td>{item.phone}</td><td>{item.ruc}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => setForm({ id: item.id, name: item.name, contact: item.contact || '', phone: item.phone || '', ruc: item.ruc || '', address: item.address || '', email: item.email || '' })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={load} /> : null}
      {form ? (
        <Modal title="Proveedor" onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid gap-3">
            {(['name', 'contact', 'phone', 'ruc', 'email', 'address'] as const).map((key) => (
              <label key={key} className="text-sm font-semibold capitalize">{key}<input className={`${controlClass} mt-1`} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
            ))}
            <PrimaryButton>Guardar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

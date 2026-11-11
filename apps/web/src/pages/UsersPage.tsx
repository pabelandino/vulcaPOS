import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, Pager, PrimaryButton, StatGrid, TableWrap, controlClass } from '../components/ui';
import { ALL_ACCESS, CASHIER_ACCESS, SectionId, SECTIONS } from '../lib/access';
import { api, qs } from '../lib/api';

type User = { id: number; username: string; name: string; role: 'ADMIN' | 'CASHIER'; active: boolean; access: SectionId[]; branchId: number | null; branchName: string | null };
type Page = { items: User[]; total: number; page: number; pages: number; summary: { users: number; admins: number } };
const empty = { username: '', name: '', password: '', role: 'CASHIER' as 'ADMIN' | 'CASHIER', branchId: 0, active: true, access: [...CASHIER_ACCESS] };

export function UsersPage() {
  const toasts = useToasts();
  const [data, setData] = useState<Page | null>(null);
  const [form, setForm] = useState<typeof empty & { id?: number } | null>(null);
  function load(page = 1) {
    api<Page>(`/api/users${qs({ page, pageSize: 10 })}`).then(setData).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try {
      const body = { ...form, branchId: form.branchId || null, password: form.password || undefined };
      if (form.id) await api(`/api/users/${form.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
      setForm(null);
      toasts.ok('Usuario guardado');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black text-navy">Usuarios</h1><PrimaryButton onClick={() => setForm(empty)}>Nuevo</PrimaryButton></div>
      {data ? <StatGrid items={[{ label: 'Usuarios', value: String(data.summary.users) }, { label: 'Administradores', value: String(data.summary.admins) }]} /> : null}
      <TableWrap>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Nombre</th><th>Usuario</th><th>Rol</th><th>Acceso</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3 font-bold">{item.name}</td>
                <td>{item.username}</td>
                <td>{item.role === 'ADMIN' ? 'Admin' : 'Caja'}</td>
                <td>{item.role === 'ADMIN' ? 'Todo' : `${item.access?.length || 0} partes`}</td>
                <td><button className="font-bold text-horizon" type="button" onClick={() => setForm({ id: item.id, username: item.username, name: item.name, password: '', role: item.role, branchId: item.branchId || 0, active: item.active, access: item.role === 'ADMIN' ? [...ALL_ACCESS] : [...(item.access || [])] })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} onPage={load} /> : null}
      {form ? (
        <Modal title="Usuario" onClose={() => setForm(null)}>
          <form onSubmit={save} className="grid gap-3">
            <label className="text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">Usuario<input className={`${controlClass} mt-1`} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
            <label className="text-sm font-semibold">Clave {form.id ? '(dejar vacío para no cambiar)' : ''}<input className={`${controlClass} mt-1`} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            <label className="text-sm font-semibold">Rol
              <select className={`${controlClass} mt-1`} value={form.role} onChange={(event) => {
                const role = event.target.value as 'ADMIN' | 'CASHIER';
                setForm({ ...form, role, access: role === 'ADMIN' ? [...ALL_ACCESS] : form.role === 'ADMIN' ? [...CASHIER_ACCESS] : form.access });
              }}>
                <option value="CASHIER">Caja</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <fieldset className="rounded-2xl border border-line p-3">
              <legend className="px-1 text-sm font-bold">Partes del sistema</legend>
              <p className="mb-2 text-xs text-muted">{form.role === 'ADMIN' ? 'El administrador entra a todo.' : 'Marque a qué puede entrar este usuario.'}</p>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((section) => {
                  const checked = form.role === 'ADMIN' || form.access.includes(section.id);
                  return (
                    <label key={section.id} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={form.role === 'ADMIN'}
                        onChange={(event) => {
                          const access = event.target.checked ? [...form.access, section.id] : form.access.filter((item) => item !== section.id);
                          setForm({ ...form, access });
                        }}
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Activo</label>
            <PrimaryButton>Guardar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

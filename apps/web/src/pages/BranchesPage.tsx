import { FormEvent, useEffect, useState } from 'react';
import { useToasts } from '../components/Toasts';
import { Modal, PrimaryButton, StatGrid, controlClass } from '../components/ui';
import { api } from '../lib/api';

type Register = { id: number; name: string; active: boolean };
type Branch = { id: number; name: string; address: string | null; phone: string | null; active: boolean; registers: Register[]; sales: number; orders: number };

export function BranchesPage() {
  const toasts = useToasts();
  const [rows, setRows] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<{ id?: number; name: string; address: string; phone: string } | null>(null);
  const [register, setRegister] = useState<{ branchId: number; name: string } | null>(null);
  function load() {
    api<Branch[]>('/api/branches').then(setRows).catch((err: Error) => toasts.err(err.message));
  }
  useEffect(() => { load(); }, []);
  async function saveBranch(event: FormEvent) {
    event.preventDefault();
    if (!branch) return;
    try {
      if (branch.id) await api(`/api/branches/${branch.id}`, { method: 'PATCH', body: JSON.stringify(branch) });
      else await api('/api/branches', { method: 'POST', body: JSON.stringify(branch) });
      setBranch(null);
      toasts.ok('Sucursal guardada');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }
  async function saveRegister(event: FormEvent) {
    event.preventDefault();
    if (!register) return;
    try {
      await api('/api/registers', { method: 'POST', body: JSON.stringify(register) });
      setRegister(null);
      toasts.ok('Caja agregada');
      load();
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo agregar la caja');
    }
  }
  const registers = rows.reduce((sum, row) => sum + row.registers.length, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black text-navy">Sucursales y cajas</h1><PrimaryButton onClick={() => setBranch({ name: '', address: '', phone: '' })}>Nueva sucursal</PrimaryButton></div>
      <StatGrid items={[{ label: 'Sucursales', value: String(rows.length) }, { label: 'Cajas', value: String(registers) }]} />
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-navy">{row.name}</h2>
                <p className="text-sm text-muted">{row.address}</p>
                <p className="text-sm text-muted">{row.phone}</p>
              </div>
              <button className="font-bold text-horizon" type="button" onClick={() => setBranch({ id: row.id, name: row.name, address: row.address || '', phone: row.phone || '' })}>Editar</button>
            </div>
            <p className="mt-2 text-xs text-muted">{row.sales} ventas · {row.orders} órdenes</p>
            <ul className="mt-3 space-y-2">
              {row.registers.map((item) => <li key={item.id} className="rounded-2xl bg-canvas px-3 py-2 font-semibold">{item.name}</li>)}
            </ul>
            <button className="mt-3 min-h-11 rounded-2xl bg-canvas px-4 font-bold text-navy" type="button" onClick={() => setRegister({ branchId: row.id, name: '' })}>Agregar caja</button>
          </article>
        ))}
      </div>
      {branch ? (
        <Modal title="Sucursal" onClose={() => setBranch(null)}>
          <form onSubmit={saveBranch} className="grid gap-3">
            <label className="text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={branch.name} onChange={(event) => setBranch({ ...branch, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">Dirección<input className={`${controlClass} mt-1`} value={branch.address} onChange={(event) => setBranch({ ...branch, address: event.target.value })} /></label>
            <label className="text-sm font-semibold">Teléfono<input className={`${controlClass} mt-1`} value={branch.phone} onChange={(event) => setBranch({ ...branch, phone: event.target.value })} /></label>
            <PrimaryButton>Guardar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
      {register ? (
        <Modal title="Nueva caja" onClose={() => setRegister(null)}>
          <form onSubmit={saveRegister} className="grid gap-3">
            <label className="text-sm font-semibold">Nombre<input className={`${controlClass} mt-1`} value={register.name} onChange={(event) => setRegister({ ...register, name: event.target.value })} /></label>
            <PrimaryButton>Agregar</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

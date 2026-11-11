import { FormEvent, useEffect, useState } from 'react';
import { CompanyInfo, Receipt, ReceiptData } from '../components/Receipt';
import { useToasts } from '../components/Toasts';
import { ErrorText, Modal, Overlay, PrimaryButton, controlClass } from '../components/ui';
import { canAccess } from '../lib/access';
import { api, apiBlob, getStoredUser } from '../lib/api';

export function SettingsPage() {
  const canEdit = canAccess(getStoredUser(), 'ajustes');
  const toasts = useToasts();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'working' | 'ready'>('idle');
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');

  useEffect(() => {
    api<CompanyInfo>('/api/settings').then(setCompany).catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    try {
      const saved = await api<CompanyInfo>('/api/settings', { method: 'PATCH', body: JSON.stringify(company) });
      setCompany(saved);
      toasts.ok('Cambios guardados');
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  async function backup() {
    setPhase('working');
    setFile(null);
    try {
      const result = await apiBlob('/api/settings/backup', { method: 'POST' });
      if (result.blob.size < 100) throw new Error('El respaldo quedó vacío');
      setFile(result);
      setPhase('ready');
    } catch (err) {
      setPhase('idle');
      toasts.err(err instanceof Error ? err.message : 'No se pudo generar el respaldo');
    }
  }

  async function chooseFolder() {
    if (!file) return;
    try {
      const picker = window.showSaveFilePicker;
      if (picker) {
        const handle = await picker({
          suggestedName: file.name,
          types: [{ description: 'Respaldo VulcaPOS', accept: { 'application/gzip': ['.gz'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(file.blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(file.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      }
      toasts.ok('Respaldo guardado');
      setPhase('idle');
      setFile(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toasts.err(err instanceof Error ? err.message : 'No se pudo guardar el archivo');
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, nextPassword }) });
      setCurrentPassword('');
      setNextPassword('');
      toasts.ok('Clave actualizada');
    } catch (err) {
      toasts.err(err instanceof Error ? err.message : 'No se pudo cambiar la clave');
    }
  }

  if (!company) return <ErrorText>{error || 'Cargando ajustes...'}</ErrorText>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-navy">Ajustes</h1>
      <form onSubmit={save} className="grid gap-3 rounded-3xl bg-white p-4 shadow-sm sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-bold text-navy">Empresa y boucher</h2>
        <Text label="Nombre de la empresa" value={company.name} onChange={(name) => setCompany({ ...company, name })} disabled={!canEdit} />
        <Text label="Nombre comercial" value={company.tradeName || ''} onChange={(tradeName) => setCompany({ ...company, tradeName })} disabled={!canEdit} />
        <Text label="RUC" value={company.ruc || ''} onChange={(ruc) => setCompany({ ...company, ruc })} disabled={!canEdit} />
        <Text label="Teléfono" value={company.phone || ''} onChange={(phone) => setCompany({ ...company, phone })} disabled={!canEdit} />
        <Text label="Ciudad" value={company.city || ''} onChange={(city) => setCompany({ ...company, city })} disabled={!canEdit} />
        <Text label="Correo" value={company.email || ''} onChange={(email) => setCompany({ ...company, email })} disabled={!canEdit} />
        <label className="sm:col-span-2 text-sm font-semibold">Dirección
          <input className={`${controlClass} mt-1`} value={company.address || ''} disabled={!canEdit} onChange={(event) => setCompany({ ...company, address: event.target.value })} />
        </label>
        <Text label="Título del boucher" value={company.voucherTitle} onChange={(voucherTitle) => setCompany({ ...company, voucherTitle })} disabled={!canEdit} />
        <Text label="Moneda" value={company.currency} onChange={(currency) => setCompany({ ...company, currency })} disabled={!canEdit} />
        <Text label="Línea del encabezado" value={company.headerLine || ''} onChange={(headerLine) => setCompany({ ...company, headerLine })} disabled={!canEdit} />
        <label className="text-sm font-semibold">IVA %
          <input className={`${controlClass} mt-1`} inputMode="decimal" disabled={!canEdit} value={company.taxRate} onChange={(event) => setCompany({ ...company, taxRate: Number(event.target.value) || 0 })} />
        </label>
        <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={company.pricesIncludeTax} disabled={!canEdit} onChange={(event) => setCompany({ ...company, pricesIncludeTax: event.target.checked })} />
          Los precios ya incluyen IVA
        </label>
        <label className="sm:col-span-2 text-sm font-semibold">Pie del boucher
          <textarea className={`${controlClass} mt-1 min-h-20`} disabled={!canEdit} value={company.voucherFooter || ''} onChange={(event) => setCompany({ ...company, voucherFooter: event.target.value })} />
        </label>
        <label className="sm:col-span-2 text-sm font-semibold">Garantía
          <textarea className={`${controlClass} mt-1 min-h-20`} disabled={!canEdit} value={company.warrantyNote || ''} onChange={(event) => setCompany({ ...company, warrantyNote: event.target.value })} />
        </label>
        <section className="sm:col-span-2">
          <h2 className="font-bold text-ink">Vista del boucher</h2>
          <p className="mt-1 text-sm text-muted">Así sale con los datos de arriba. 58 mm y 80 mm son los rollos de ticket más usados.</p>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            {([58, 80] as const).map((size) => (
              <div key={size} className="min-w-0">
                <p className="mb-2 text-sm font-bold">{size} mm</p>
                <div className="overflow-x-auto rounded-2xl bg-canvas p-3">
                  <Receipt company={company} receipt={sampleReceipt(company)} width={size} preview />
                </div>
              </div>
            ))}
          </div>
        </section>
        {canEdit ? <PrimaryButton className="sm:col-span-2">Guardar cambios</PrimaryButton> : null}
      </form>
      {canEdit ? (
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="font-bold text-navy">Respaldo local</h2>
          <p className="mt-1 text-sm text-ink/70">El archivo SQL trae la estructura y todos los datos: usuarios, productos, ventas, órdenes, caja e inventario. Con eso se puede restaurar la base completa. Primero se genera y, cuando está listo, aparece la ventana para elegir la carpeta o el USB.</p>
          <PrimaryButton className="mt-3" onClick={() => void backup()}>Crear respaldo</PrimaryButton>
        </section>
      ) : null}
      <form onSubmit={changePassword} className="grid gap-3 rounded-3xl bg-white p-4 shadow-sm sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-bold text-navy">Mi clave</h2>
        <Text label="Clave actual" value={currentPassword} onChange={setCurrentPassword} type="password" />
        <Text label="Clave nueva" value={nextPassword} onChange={setNextPassword} type="password" />
        <PrimaryButton className="sm:col-span-2">Cambiar clave</PrimaryButton>
      </form>
      {phase === 'working' ? <Overlay title="Generando respaldo" text="Espere a que termine. La ventana para guardarlo aparece cuando el archivo está listo." /> : null}
      {phase === 'ready' && file ? (
        <Modal title="El respaldo está listo" onClose={() => { setPhase('idle'); setFile(null); }}>
          <p className="text-sm text-ink/70">Elija dónde guardarlo. El nombre sugerido es {file.name}.</p>
          <PrimaryButton className="mt-4 w-full" onClick={() => void chooseFolder()}>Elegir carpeta y guardar</PrimaryButton>
        </Modal>
      ) : null}
    </div>
  );
}

function sampleReceipt(company: CompanyInfo): ReceiptData {
  const rate = Number(company.taxRate) || 0;
  const subtotal = 280;
  const discount = 0;
  const total = subtotal - discount;
  const tax = company.pricesIncludeTax ? Math.round((total * rate) / (100 + rate) * 100) / 100 : Math.round(total * rate) / 100;
  return {
    number: 1042,
    createdAt: new Date().toISOString(),
    cashierName: 'Caja',
    customerName: 'Cliente general',
    vehicle: 'General',
    lines: [
      { name: 'Parche convencional', quantity: 1, unitPrice: 150, amount: 150 },
      { name: 'Balanceo', quantity: 1, unitPrice: 130, amount: 130 },
    ],
    subtotal,
    discount,
    tax,
    total,
    paymentMethod: 'CASH',
    cashAmount: 300,
    cardAmount: 0,
    transferAmount: 0,
    changeAmount: 20,
  };
}

function Text({ label, value, onChange, disabled, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; disabled?: boolean; type?: string }) {
  return (
    <label className="text-sm font-semibold">{label}
      <input className={`${controlClass} mt-1`} type={type} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ConnectQr } from '../components/ConnectQr';
import { ErrorText, PrimaryButton } from '../components/ui';
import { firstRoute } from '../lib/access';
import { api, getStoredUser, saveSession, SessionUser } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const existing = getStoredUser();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(false);
  if (existing) return <Navigate to={firstRoute(existing) || '/ventas'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token: string; user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      saveSession(result.token, result.user);
      navigate(firstRoute(result.user) || '/ventas', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-xl shadow-horizon/10 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-lime text-2xl font-black text-ink">V</span>
          <div>
            <h1 className="text-2xl font-black text-navy">VulcaPOS</h1>
            <p className="text-sm text-muted">Vulcanizadora El Caucho</p>
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <label className="mt-4 block text-sm font-semibold text-ink">
          Usuario
          <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-ink">
          Contraseña
          <input className="mt-1 min-h-12 w-full rounded-2xl border border-line px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <PrimaryButton className="mt-5 w-full" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</PrimaryButton>
        <p className="mt-4 text-center text-xs text-muted">Demo: admin / Admin123! · caja / Caja123!</p>
        <button className="mt-3 min-h-11 w-full rounded-full bg-canvas text-sm font-bold" type="button" onClick={() => setQr((value) => !value)}>
          {qr ? 'Ocultar código' : 'Abrir en el teléfono'}
        </button>
        {qr ? <div className="mt-3"><ConnectQr /></div> : null}
      </form>
    </div>
  );
}

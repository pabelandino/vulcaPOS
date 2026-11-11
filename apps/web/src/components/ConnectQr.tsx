import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';

type Address = { name: string; address: string };

export function ConnectQr() {
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [svg, setSvg] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api<{ addresses: Address[] }>('/api/network');
        const port = window.location.port;
        const next = data.addresses.map((item) => `${window.location.protocol}//${item.address}${port ? `:${port}` : ''}/`);
        if (alive) setUrls(next);
      } catch {
        if (alive) setUrls([]);
      } finally {
        if (alive) setReady(true);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const url = urls[index] || urls[0] || '';

  useEffect(() => {
    if (!url) {
      setSvg('');
      return;
    }
    QRCode.toString(url, { type: 'svg', margin: 1, width: 220, color: { dark: '#111111', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [url]);

  if (!ready) return <p className="text-sm text-muted">Buscando la dirección de esta red...</p>;

  if (!url) {
    return <p className="text-sm text-muted">Conecte esta computadora al Wi-Fi para generar el código. El teléfono tiene que estar en la misma red.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto w-fit rounded-3xl bg-white p-3" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="break-all text-center text-sm font-bold">{url}</p>
      <p className="text-center text-xs text-muted">Escanee con la cámara del teléfono. Si la IP cambia, este código se actualiza solo: vuelva a escanearlo.</p>
      {urls.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {urls.map((item, itemIndex) => (
            <button key={item} type="button" className={`min-h-10 rounded-full px-3 text-xs font-bold ${item === url ? 'bg-ink text-white' : 'bg-canvas'}`} onClick={() => setIndex(itemIndex)}>
              {item.replace(/^https?:\/\//, '')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

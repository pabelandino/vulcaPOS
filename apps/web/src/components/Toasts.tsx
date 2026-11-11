import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };

const ToastContext = createContext<{
  push: (kind: Toast['kind'], text: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, kind, text }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), kind === 'err' ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${
              item.kind === 'err' ? 'bg-red-600 text-white' : item.kind === 'ok' ? 'bg-navy text-white' : 'bg-white text-navy'
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('Toasts missing');
  return {
    ok: (text: string) => context.push('ok', text),
    err: (text: string) => context.push('err', text),
    info: (text: string) => context.push('info', text),
  };
}

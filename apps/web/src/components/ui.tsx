import { ReactNode } from 'react';

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-horizon/20 border-t-horizon ${className}`} />;
}

export function Overlay({ title, text }: { title: string; text: string }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-navy/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-8 text-center shadow-2xl">
        <Spinner className="mx-auto h-10 w-10" />
        <p className="mt-4 text-lg font-bold text-navy">{title}</p>
        <p className="mt-1 text-sm text-ink/70">{text}</p>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink" onClick={onClose} type="button" aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const controlClass = 'min-h-12 w-full rounded-2xl border border-line bg-white px-3 text-ink outline-none focus:border-horizon';

export function StatGrid({ items }: { items: Array<{ label: string; value: string; hint?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <article key={item.label} className="rounded-3xl bg-white p-4 shadow-sm shadow-horizon/5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</p>
          <p className="mt-2 text-xl font-bold text-navy sm:text-2xl">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-ink/60">{item.hint}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink/70">
      <span>{total} registros</span>
      <div className="flex items-center gap-2">
        <button className="min-h-11 rounded-2xl bg-white px-4 font-semibold text-navy disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">
          Anterior
        </button>
        <span className="min-w-16 text-center font-semibold text-navy">
          {page} / {pages}
        </span>
        <button className="min-h-11 rounded-2xl bg-white px-4 font-semibold text-navy disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} type="button">
          Siguiente
        </button>
      </div>
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm shadow-horizon/5">
      <p className="px-4 pt-3 text-xs text-muted lg:hidden">Deslice la tabla para ver más columnas</p>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{children}</p>;
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`min-h-12 rounded-full bg-lime px-4 font-bold text-ink disabled:opacity-50 ${props.className || ''}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`min-h-12 rounded-2xl bg-canvas px-4 font-semibold text-navy ${props.className || ''}`}>
      {children}
    </button>
  );
}

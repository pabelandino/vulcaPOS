import { lazy, Suspense, useEffect, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Spinner } from '../components/ui';
import { api, getStoredUser } from '../lib/api';
import { money, PAYMENT_LABEL } from '../lib/format';

const Chart = lazy(() => import('react-apexcharts'));

type Dashboard = {
  today: { sales: number; services: number; total: number; profit: number; tickets: number; average: number };
  series: Array<{ date: string; sales: number; services: number }>;
  payments: Array<{ method: string; total: number }>;
  topServices: Array<{ name: string; total: number; count: number }>;
  lowStock: Array<{ id: number; name: string; sku: string; stock: number; minStock: number }>;
  openOrders: number;
};

const base: ApexOptions = {
  chart: { toolbar: { show: false }, fontFamily: 'DM Sans, Segoe UI, sans-serif' },
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(163, 174, 208, 0.3)', strokeDashArray: 5 },
  legend: { labels: { colors: '#A3AED0' } },
};

export function DashboardPage() {
  const admin = getStoredUser()?.role === 'ADMIN';
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Dashboard>('/api/reports/dashboard').then(setData).catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>;
  if (!data) return <div className="grid min-h-40 place-items-center"><Spinner /></div>;
  const line: ApexOptions = {
    ...base,
    colors: ['#111111', '#8BCF1A'],
    stroke: { curve: 'smooth', width: 3 },
    xaxis: { categories: data.series.map((row) => row.date), labels: { style: { colors: '#A3AED0' } } },
    yaxis: { labels: { style: { colors: '#A3AED0' }, formatter: (value) => money(Number(value)) } },
    tooltip: { y: { formatter: (value) => money(Number(value)) } },
  };
  const donut: ApexOptions = {
    ...base,
    labels: data.payments.map((row) => PAYMENT_LABEL[row.method] || row.method),
    colors: ['#111111', '#C6F54A', '#F5C542', '#8BCF1A'],
    plotOptions: { pie: { donut: { size: '68%' } } },
    tooltip: { y: { formatter: (value) => money(Number(value)) } },
  };
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] bg-ink p-5 text-white">
        <p className="text-sm text-white/60">Hoy en la vulcanizadora</p>
        <p className="mt-3 text-sm text-white/70">Total del día</p>
        <p className="text-4xl font-black tracking-tight">{money(data.today.total)}</p>
        <p className="mt-1 text-xs text-white/50">{data.today.tickets} documentos · promedio {money(data.today.average)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-white/60">Ventas</p>
            <p className="text-lg font-bold">{money(data.today.sales)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-white/60">Servicios</p>
            <p className="text-lg font-bold">{money(data.today.services)}</p>
          </div>
          <div className="rounded-2xl bg-lime p-3 text-ink">
            <p className="text-xs font-semibold">{admin ? 'Ganancia' : 'Órdenes abiertas'}</p>
            <p className="text-lg font-black">{admin ? money(data.today.profit) : data.openOrders}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-white/60">Órdenes abiertas</p>
            <p className="text-lg font-bold">{data.openOrders}</p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-navy">Últimos 14 días</h2>
          <Suspense fallback={<Spinner />}>
            <Chart type="area" height={280} options={line} series={[{ name: 'Ventas', data: data.series.map((row) => row.sales) }, { name: 'Servicios', data: data.series.map((row) => row.services) }]} />
          </Suspense>
        </section>
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-navy">Formas de pago</h2>
          {data.payments.length ? (
            <Suspense fallback={<Spinner />}>
              <Chart type="donut" height={280} options={donut} series={data.payments.map((row) => row.total)} />
            </Suspense>
          ) : <p className="text-sm text-muted">Todavía no hay cobros en el período.</p>}
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-navy">Servicios más vendidos</h2>
          <div className="space-y-3">
            {data.topServices.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy">{row.name}</p>
                  <p className="text-xs text-muted">{row.count} veces</p>
                </div>
                <p className="font-bold text-horizon">{money(row.total)}</p>
              </div>
            ))}
            {!data.topServices.length ? <p className="text-sm text-muted">Sin servicios cobrados.</p> : null}
          </div>
        </section>
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-navy">Existencia baja</h2>
          <div className="space-y-3">
            {data.lowStock.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy">{row.name}</p>
                  <p className="text-xs text-muted">{row.sku}</p>
                </div>
                <p className="font-bold text-red-600">{row.stock} / mín {row.minStock}</p>
              </div>
            ))}
            {!data.lowStock.length ? <p className="text-sm text-muted">No hay productos bajo el mínimo.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

import ExcelJS from 'exceljs';

const PAYMENT: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MIXED: 'Mixto',
};

const STATUS: Record<string, string> = {
  PAID: 'Pagada',
  OPEN: 'Abierta',
  VOID: 'Anulada',
  CANCELLED: 'Cancelada',
};

type Cell = string | number | null;
type Column = { header: string; key: string; width: number; money?: boolean };

export type ExcelSale = {
  number: number;
  kind: string;
  status: string;
  businessDate: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  detail: string;
  total: number;
  profit: number;
};

export type ExcelOrder = {
  number: number;
  businessDate: string;
  customerName: string;
  plate: string | null;
  cashierName: string;
  paymentMethod: string | null;
  detail: string;
  total: number;
  profit: number;
};

export type ExcelGroup = { code: string; name: string; quantity: number; total: number; profit: number; sellers?: Array<{ name: string; quantity: number }> };
export type ExcelWorker = {
  name: string;
  username: string;
  role: 'ADMIN' | 'CASHIER' | null;
  documents: number;
  salesCount: number;
  salesTotal: number;
  serviceCount: number;
  serviceTotal: number;
  total: number;
  paid: number;
  profit: number;
  sold?: Array<{ name: string; quantity: number }>;
};
export type ExcelLow = {
  sku: string;
  name: string;
  category: string | null;
  stock: number;
  minStock: number;
  missing: number;
  out: boolean;
};

export type ReportWorkbookInput = {
  tab: 'general' | 'vendidos' | 'trabajadores' | 'existencias';
  from: string;
  to: string;
  admin: boolean;
  summary?: {
    net: { count: number; total: number; cash: number; card: number; transfer: number; discount: number; tax: number; profit: number };
    sales: { count: number; total: number };
    services: { count: number; total: number };
    returns: { count: number; total: number };
    payroll: number;
  };
  sales?: ExcelSale[];
  orders?: ExcelOrder[];
  products?: ExcelGroup[];
  servicesSold?: ExcelGroup[];
  workers?: ExcelWorker[];
  low?: ExcelLow[];
  lowSummary?: { low: number; out: number; short: number; missingCost: number };
};

export async function reportWorkbook(input: ReportWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VulcaPOS';
  workbook.created = new Date();
  if (input.tab === 'general' && input.summary) {
    fillGeneral(workbook, input);
  }
  if (input.tab === 'vendidos') {
    fillGroups(workbook, 'Productos vendidos', input.products || [], input.admin);
    fillGroups(workbook, 'Servicios realizados', input.servicesSold || [], input.admin);
  }
  if (input.tab === 'trabajadores') fillWorkers(workbook, input.workers || [], input.admin);
  if (input.tab === 'existencias') fillLow(workbook, input.low || [], input.lowSummary);
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function fillGeneral(workbook: ExcelJS.Workbook, input: ReportWorkbookInput) {
  const summary = input.summary;
  if (!summary) return;
  const rows: Array<Record<string, Cell>> = [
    { label: 'Ventas de productos', count: summary.sales.count, amount: summary.sales.total },
    { label: 'Servicios cobrados', count: summary.services.count, amount: summary.services.total },
    { label: 'Devoluciones', count: summary.returns.count, amount: summary.returns.total },
    { label: 'Neto', count: summary.net.count, amount: summary.net.total },
    { label: 'Efectivo', count: null, amount: summary.net.cash },
    { label: 'Tarjeta', count: null, amount: summary.net.card },
    { label: 'Transferencia', count: null, amount: summary.net.transfer },
    { label: 'Descuento', count: null, amount: summary.net.discount },
    { label: 'IVA', count: null, amount: summary.net.tax },
    { label: 'Pagado a trabajadores', count: null, amount: summary.payroll },
  ];
  if (input.admin) rows.push({ label: 'Ganancia', count: null, amount: summary.net.profit });
  addSheet(workbook, 'Resumen', [
    { header: 'Concepto', key: 'label', width: 28 },
    { header: 'Cantidad', key: 'count', width: 14 },
    { header: 'Monto', key: 'amount', width: 16, money: true },
  ], rows);

  const saleColumns: Column[] = [
    { header: 'Número', key: 'number', width: 12 },
    { header: 'Tipo', key: 'kind', width: 14 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Cliente', key: 'customer', width: 24 },
    { header: 'Vendió', key: 'cashier', width: 22 },
    { header: 'Productos', key: 'detail', width: 42 },
    { header: 'Pago', key: 'payment', width: 16 },
    { header: 'Total', key: 'total', width: 14, money: true },
  ];
  if (input.admin) saleColumns.push({ header: 'Ganancia', key: 'profit', width: 14, money: true });
  addSheet(workbook, 'Ventas de productos', saleColumns, (input.sales || []).map((row) => ({
    number: row.number,
    kind: row.kind === 'RETURN' ? 'Devolución' : 'Venta',
    status: STATUS[row.status] || row.status,
    date: row.businessDate,
    customer: row.customerName,
    cashier: row.cashierName,
    detail: row.detail,
    payment: PAYMENT[row.paymentMethod] || row.paymentMethod,
    total: row.total,
    profit: row.profit,
  })));

  const orderColumns: Column[] = [
    { header: 'Número', key: 'number', width: 12 },
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Cliente', key: 'customer', width: 24 },
    { header: 'Placa', key: 'plate', width: 14 },
    { header: 'Vendió', key: 'cashier', width: 22 },
    { header: 'Detalle', key: 'detail', width: 42 },
    { header: 'Pago', key: 'payment', width: 16 },
    { header: 'Total', key: 'total', width: 14, money: true },
  ];
  if (input.admin) orderColumns.push({ header: 'Ganancia', key: 'profit', width: 14, money: true });
  addSheet(workbook, 'Servicios cobrados', orderColumns, (input.orders || []).map((row) => ({
    number: row.number,
    date: row.businessDate,
    customer: row.customerName,
    plate: row.plate || '',
    cashier: row.cashierName,
    detail: row.detail,
    payment: row.paymentMethod ? PAYMENT[row.paymentMethod] || row.paymentMethod : 'Pendiente',
    total: row.total,
    profit: row.profit,
  })));
}

function fillGroups(workbook: ExcelJS.Workbook, name: string, rows: ExcelGroup[], admin: boolean) {
  const columns: Column[] = [
    { header: 'Código', key: 'code', width: 16 },
    { header: 'Nombre', key: 'name', width: 32 },
    { header: 'Vendió', key: 'sellers', width: 36 },
    { header: 'Cantidad', key: 'quantity', width: 14 },
    { header: 'Total', key: 'total', width: 14, money: true },
  ];
  if (admin) columns.push({ header: 'Ganancia', key: 'profit', width: 14, money: true });
  addSheet(workbook, name, columns, rows.map((row) => ({
    code: row.code,
    name: row.name,
    sellers: (row.sellers || []).map((seller) => `${seller.name} × ${seller.quantity}`).join(', '),
    quantity: row.quantity,
    total: row.total,
    profit: row.profit,
  })));
}

function fillWorkers(workbook: ExcelJS.Workbook, rows: ExcelWorker[], admin: boolean) {
  const columns: Column[] = [
    { header: 'Trabajador', key: 'name', width: 24 },
    { header: 'Vendió', key: 'sold', width: 42 },
    { header: 'Usuario', key: 'username', width: 16 },
    { header: 'Rol', key: 'role', width: 16 },
    { header: 'Documentos', key: 'documents', width: 14 },
    { header: 'Ventas de productos', key: 'salesCount', width: 20 },
    { header: 'Productos', key: 'salesTotal', width: 14, money: true },
    { header: 'Servicios', key: 'serviceCount', width: 14 },
    { header: 'Servicios cobrados', key: 'serviceTotal', width: 18, money: true },
    { header: 'Cobrado', key: 'total', width: 14, money: true },
    { header: 'Planilla', key: 'paid', width: 14, money: true },
  ];
  if (admin) columns.push({ header: 'Ganancia', key: 'profit', width: 14, money: true });
  addSheet(workbook, 'Trabajadores', columns, rows.map((row) => ({
    name: row.name,
    sold: (row.sold || []).map((item) => `${item.name} × ${item.quantity}`).join(', '),
    username: row.username,
    role: row.role === 'ADMIN' ? 'Administrador' : row.role === 'CASHIER' ? 'Caja' : '',
    documents: row.documents,
    salesCount: row.salesCount,
    salesTotal: row.salesTotal,
    serviceCount: row.serviceCount,
    serviceTotal: row.serviceTotal,
    total: row.total,
    paid: row.paid,
    profit: row.profit,
  })));
}

function fillLow(workbook: ExcelJS.Workbook, rows: ExcelLow[], summary?: ReportWorkbookInput['lowSummary']) {
  if (summary) {
    addSheet(workbook, 'Resumen', [
      { header: 'Concepto', key: 'label', width: 28 },
      { header: 'Valor', key: 'value', width: 16 },
    ], [
      { label: 'Con poco o nada', value: summary.low },
      { label: 'Sin existencia', value: summary.out },
      { label: 'Bajo el mínimo', value: summary.short },
      { label: 'Costo de lo que falta', value: summary.missingCost },
    ]);
    workbook.getWorksheet('Resumen')!.getCell('B5').numFmt = '#,##0.00';
  }
  addSheet(workbook, 'Poco stock', [
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto', key: 'name', width: 32 },
    { header: 'Categoría', key: 'category', width: 18 },
    { header: 'Existencia', key: 'stock', width: 14 },
    { header: 'Mínimo', key: 'minStock', width: 12 },
    { header: 'Faltan', key: 'missing', width: 12 },
    { header: 'Estado', key: 'status', width: 18 },
  ], rows.map((row) => ({
    sku: row.sku,
    name: row.name,
    category: row.category || '',
    stock: row.stock,
    minStock: row.minStock,
    missing: row.missing,
    status: row.out ? 'Sin existencia' : 'Bajo el mínimo',
  })));
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: Column[], rows: Array<Record<string, Cell>>) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  if (rows.length) sheet.addRows(rows);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (columns.length) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  columns.forEach((column, index) => {
    if (column.money) sheet.getColumn(index + 1).numFmt = '#,##0.00';
  });
  return sheet;
}

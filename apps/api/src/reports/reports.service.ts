import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { addDays, businessToday, parseYmd, todayYmd, ymd } from '../common/dates';
import { money, num } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { reportWorkbook } from './reports-excel';

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(from?: string, to?: string) {
    const range = this.range(from, to);
    const [sales, returns, orders, payroll] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: 'PAID', kind: 'SALE', businessDate: range },
        select: { subtotal: true, discount: true, tax: true, total: true, profit: true, paymentMethod: true, cashAmount: true, cardAmount: true, transferAmount: true },
      }),
      this.prisma.sale.findMany({
        where: { status: 'PAID', kind: 'RETURN', businessDate: range },
        select: { subtotal: true, discount: true, tax: true, total: true, profit: true, paymentMethod: true, cashAmount: true, cardAmount: true, transferAmount: true },
      }),
      this.prisma.serviceOrder.findMany({
        where: { status: 'PAID', businessDate: range },
        select: { subtotal: true, discount: true, tax: true, total: true, profit: true, paymentMethod: true, cashAmount: true, cardAmount: true, transferAmount: true },
      }),
      this.prisma.payrollPayment.aggregate({ where: { paidAt: range }, _sum: { amount: true } }),
    ]);
    const add = (bucket: Totals, row: (typeof orders)[number], sign: number) => {
      bucket.count += 1;
      bucket.subtotal += sign * num(row.subtotal);
      bucket.discount += sign * num(row.discount);
      bucket.tax += sign * num(row.tax);
      bucket.total += sign * num(row.total);
      bucket.profit += sign * num(row.profit);
      bucket.cash += sign * num(row.cashAmount);
      bucket.card += sign * num(row.cardAmount);
      bucket.transfer += sign * num(row.transferAmount);
    };
    const salesTotals = emptyTotals();
    const returnTotals = emptyTotals();
    const orderTotals = emptyTotals();
    sales.forEach((row) => add(salesTotals, row, 1));
    returns.forEach((row) => add(returnTotals, row, 1));
    orders.forEach((row) => add(orderTotals, row, 1));
    const net = emptyTotals();
    for (const key of Object.keys(net) as Array<keyof Totals>) {
      net[key] = money(salesTotals[key] + orderTotals[key] - returnTotals[key]);
    }
    return {
      from: ymd(range.gte),
      to: ymd(range.lte),
      sales: roundTotals(salesTotals),
      services: roundTotals(orderTotals),
      returns: roundTotals(returnTotals),
      net: roundTotals(net),
      payroll: num(payroll._sum.amount),
    };
  }

  async sales(query: { page?: string; pageSize?: string; from?: string; to?: string; q?: string }) {
    const page = pageArgs(query);
    const range = this.range(query.from, query.to);
    const term = query.q?.trim();
    const where = {
      businessDate: range,
      ...(term
        ? {
            OR: [
              { customerName: { contains: term, mode: 'insensitive' as const } },
              { plate: { contains: term, mode: 'insensitive' as const } },
              ...(Number(term) ? [{ number: Number(term) }] : []),
            ],
          }
        : {}),
    };
    const [rows, total, all] = await Promise.all([
      this.prisma.sale.findMany({ where, orderBy: [{ businessDate: 'desc' }, { number: 'desc' }], skip: page.skip, take: page.take, include: { items: true } }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({ where: { ...where, status: 'PAID' }, select: { kind: true, subtotal: true, discount: true, tax: true, total: true, profit: true } }),
    ]);
    const summary = all.reduce(
      (acc, row) => {
        const sign = row.kind === 'RETURN' ? -1 : 1;
        acc.subtotal += sign * num(row.subtotal);
        acc.discount += sign * num(row.discount);
        acc.tax += sign * num(row.tax);
        acc.total += sign * num(row.total);
        acc.profit += sign * num(row.profit);
        return acc;
      },
      { subtotal: 0, discount: 0, tax: 0, total: 0, profit: 0 },
    );
    const pageSubtotal = money(rows.filter((row) => row.status === 'PAID').reduce((sum, row) => sum + (row.kind === 'RETURN' ? -1 : 1) * num(row.total), 0));
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        kind: row.kind,
        status: row.status,
        businessDate: row.businessDate,
        customerName: row.customerName,
        plate: row.plate,
        paymentMethod: row.paymentMethod,
        subtotal: num(row.subtotal),
        discount: num(row.discount),
        tax: num(row.tax),
        total: num(row.total),
        profit: num(row.profit),
        cashierName: row.cashierName,
        items: row.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: num(item.quantity),
          returnedQty: num(item.returnedQty),
          unitPrice: num(item.unitPrice),
          amount: num(item.amount),
        })),
      })),
      total,
      page.page,
      page.pageSize,
      { summary, pageSubtotal },
    );
  }

  async orders(query: { page?: string; pageSize?: string; from?: string; to?: string; q?: string }) {
    const page = pageArgs(query);
    const range = this.range(query.from, query.to);
    const where = { status: 'PAID' as const, businessDate: range, ...(query.q?.trim() ? { customerName: { contains: query.q.trim(), mode: 'insensitive' as const } } : {}) };
    const [rows, total, sums] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where, orderBy: [{ businessDate: 'desc' }, { number: 'desc' }], skip: page.skip, take: page.take, include: { lines: true } }),
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.aggregate({ where, _sum: { subtotal: true, discount: true, tax: true, total: true, profit: true } }),
    ]);
    const pageSubtotal = money(rows.reduce((sum, row) => sum + num(row.total), 0));
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        businessDate: row.businessDate,
        customerName: row.customerName,
        plate: row.plate,
        brought: row.brought,
        broughtNote: row.broughtNote,
        paymentMethod: row.paymentMethod,
        subtotal: num(row.subtotal),
        discount: num(row.discount),
        tax: num(row.tax),
        total: num(row.total),
        profit: num(row.profit),
        cashierName: row.cashierName,
        lines: row.lines.map((line) => ({
          name: line.name,
          quantity: num(line.quantity),
          amount: num(line.amount),
        })),
      })),
      total,
      page.page,
      page.pageSize,
      {
        summary: {
          subtotal: num(sums._sum.subtotal),
          discount: num(sums._sum.discount),
          tax: num(sums._sum.tax),
          total: num(sums._sum.total),
          profit: num(sums._sum.profit),
        },
        pageSubtotal,
      },
    );
  }

  async sold(query: { from?: string; to?: string; productPage?: string; servicePage?: string; pageSize?: string }) {
    const { productRows, serviceRows } = await this.soldGroups(query.from, query.to);
    const productPage = pageArgs({ page: query.productPage, pageSize: query.pageSize });
    const servicePage = pageArgs({ page: query.servicePage, pageSize: query.pageSize });
    return {
      products: pageOf(productRows.slice(productPage.skip, productPage.skip + productPage.take).map(roundGroup), productRows.length, productPage.page, productPage.pageSize, {
        summary: sumGroup(productRows),
      }),
      services: pageOf(serviceRows.slice(servicePage.skip, servicePage.skip + servicePage.take).map(roundGroup), serviceRows.length, servicePage.page, servicePage.pageSize, {
        summary: sumGroup(serviceRows),
      }),
    };
  }

  async workers(from?: string, to?: string) {
    const range = this.range(from, to);
    const [users, sales, orders, payments, saleItems, orderLines] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, username: true, role: true, active: true } }),
      this.prisma.sale.findMany({
        where: { status: 'PAID', businessDate: range },
        select: { cashierId: true, cashierName: true, kind: true, total: true, profit: true },
      }),
      this.prisma.serviceOrder.findMany({
        where: { status: 'PAID', businessDate: range },
        select: { cashierId: true, cashierName: true, total: true, profit: true },
      }),
      this.prisma.payrollPayment.findMany({
        where: { paidAt: range },
        select: { userId: true, amount: true },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { status: 'PAID', businessDate: range } },
        select: { name: true, quantity: true, sale: { select: { cashierId: true, cashierName: true, kind: true } } },
      }),
      this.prisma.serviceOrderLine.findMany({
        where: { order: { status: 'PAID', businessDate: range } },
        select: { name: true, quantity: true, order: { select: { cashierId: true, cashierName: true } } },
      }),
    ]);
    const rows = new Map<string, WorkerRow>();
    const ensure = (userId: number | null, name: string) => {
      const key = userId ? `user:${userId}` : `name:${name}`;
      const current = rows.get(key);
      if (current) return current;
      const created: WorkerRow = {
        userId,
        name: name || 'Sin cajero',
        username: '',
        role: null,
        active: false,
        salesTotal: 0,
        salesCount: 0,
        serviceTotal: 0,
        serviceCount: 0,
        profit: 0,
        paid: 0,
        sold: new Map<string, number>(),
      };
      rows.set(key, created);
      return created;
    };
    for (const user of users) {
      const row = ensure(user.id, user.name);
      row.username = user.username;
      row.role = user.role;
      row.active = user.active;
    }
    for (const sale of sales) {
      const sign = sale.kind === 'RETURN' ? -1 : 1;
      const row = ensure(sale.cashierId, sale.cashierName);
      row.salesTotal += sign * num(sale.total);
      row.salesCount += sign > 0 ? 1 : 0;
      row.profit += sign * num(sale.profit);
    }
    for (const order of orders) {
      const row = ensure(order.cashierId, order.cashierName);
      row.serviceTotal += num(order.total);
      row.serviceCount += 1;
      row.profit += num(order.profit);
    }
    for (const payment of payments) {
      const row = ensure(payment.userId, '');
      row.paid += num(payment.amount);
    }
    const addSold = (userId: number | null, cashierName: string, itemName: string, quantity: number) => {
      const row = ensure(userId, cashierName);
      row.sold.set(itemName, (row.sold.get(itemName) || 0) + quantity);
    };
    for (const item of saleItems) {
      const sign = item.sale.kind === 'RETURN' ? -1 : 1;
      addSold(item.sale.cashierId, item.sale.cashierName, item.name, sign * num(item.quantity));
    }
    for (const line of orderLines) {
      addSold(line.order.cashierId, line.order.cashierName, line.name, num(line.quantity));
    }
    const items = [...rows.values()]
      .filter((row) => row.active || row.salesCount || row.serviceCount || row.paid)
      .map((row) => ({
        userId: row.userId,
        name: row.name,
        username: row.username,
        role: row.role,
        active: row.active,
        salesTotal: money(row.salesTotal),
        serviceTotal: money(row.serviceTotal),
        total: money(row.salesTotal + row.serviceTotal),
        profit: money(row.profit),
        paid: money(row.paid),
        documents: row.salesCount + row.serviceCount,
        salesCount: row.salesCount,
        serviceCount: row.serviceCount,
        sold: [...row.sold.entries()]
          .map(([name, quantity]) => ({ name, quantity: money(quantity) }))
          .filter((item) => item.quantity !== 0)
          .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, 'es')),
      }));
    return {
      items,
      summary: {
        total: money(items.reduce((sum, row) => sum + row.total, 0)),
        profit: money(items.reduce((sum, row) => sum + row.profit, 0)),
        paid: money(items.reduce((sum, row) => sum + row.paid, 0)),
        workers: items.length,
      },
    };
  }

  async lowStock(query: { page?: string; pageSize?: string; q?: string }) {
    const page = pageArgs(query);
    const matched = await this.lowMatches(query.q);
    const items = matched.slice(page.skip, page.skip + page.take).map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      category: row.category,
      stock: num(row.stock),
      minStock: num(row.minStock),
      missing: money(Math.max(0, num(row.minStock) - num(row.stock))),
      cost: num(row.cost),
      price: num(row.price),
      out: num(row.stock) <= 0,
    }));
    const out = matched.filter((row) => num(row.stock) <= 0).length;
    const missingCost = money(matched.reduce((sum, row) => sum + Math.max(0, num(row.minStock) - num(row.stock)) * num(row.cost), 0));
    return pageOf(items, matched.length, page.page, page.pageSize, {
      summary: { low: matched.length, out, short: matched.length - out, missingCost },
    });
  }

  async dashboard() {
    const today = todayYmd();
    const start = addDays(today, -13);
    const [sales, orders, lowStock, openOrders] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: 'PAID', businessDate: { gte: start, lte: businessToday() } },
        select: { kind: true, businessDate: true, total: true, profit: true, paymentMethod: true },
      }),
      this.prisma.serviceOrder.findMany({
        where: { status: 'PAID', businessDate: { gte: start, lte: businessToday() } },
        select: { businessDate: true, total: true, profit: true, paymentMethod: true, lines: { select: { kind: true, name: true, amount: true, quantity: true } } },
      }),
      this.prisma.product.findMany({ where: { active: true }, orderBy: { stock: 'asc' }, take: 80 }),
      this.prisma.serviceOrder.count({ where: { status: 'OPEN' } }),
    ]);
    const days = Array.from({ length: 14 }, (_, index) => ymd(addDays(today, index - 13)));
    const series = days.map((day) => ({
      date: day.slice(5),
      sales: 0,
      services: 0,
    }));
    const byDay = new Map(series.map((row) => [row.date, row]));
    const payments = new Map<PaymentMethod, number>();
    let todaySales = 0;
    let todayServices = 0;
    let todayTotal = 0;
    let todayProfit = 0;
    let todayCount = 0;
    const addPayment = (method: PaymentMethod | null, total: number) => {
      if (!method) return;
      payments.set(method, (payments.get(method) || 0) + total);
    };
    for (const sale of sales) {
      const key = ymd(sale.businessDate).slice(5);
      const sign = sale.kind === 'RETURN' ? -1 : 1;
      const bucket = byDay.get(key);
      if (bucket) bucket.sales += sign * num(sale.total);
      addPayment(sale.paymentMethod, sign * num(sale.total));
      if (ymd(sale.businessDate) === today) {
        todaySales += sign * num(sale.total);
        todayTotal += sign * num(sale.total);
        todayProfit += sign * num(sale.profit);
        todayCount += sign > 0 ? 1 : 0;
      }
    }
    const top = new Map<string, { name: string; total: number; count: number }>();
    for (const order of orders) {
      const key = ymd(order.businessDate).slice(5);
      const bucket = byDay.get(key);
      if (bucket) bucket.services += num(order.total);
      addPayment(order.paymentMethod, num(order.total));
      if (ymd(order.businessDate) === today) {
        todayServices += num(order.total);
        todayTotal += num(order.total);
        todayProfit += num(order.profit);
        todayCount += 1;
      }
      for (const line of order.lines) {
        if (line.kind !== 'SERVICE') continue;
        const current = top.get(line.name) || { name: line.name, total: 0, count: 0 };
        current.total += num(line.amount);
        current.count += num(line.quantity);
        top.set(line.name, current);
      }
    }
    return {
      today: {
        sales: money(todaySales),
        services: money(todayServices),
        total: money(todayTotal),
        profit: money(todayProfit),
        tickets: todayCount,
        average: todayCount ? money(todayTotal / todayCount) : 0,
      },
      series: series.map((row) => ({ ...row, sales: money(row.sales), services: money(row.services) })),
      payments: [...payments.entries()].map(([method, total]) => ({ method, total: money(total) })),
      topServices: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 6).map((row) => ({ ...row, total: money(row.total) })),
      lowStock: lowStock
        .filter((product) => num(product.stock) <= num(product.minStock))
        .slice(0, 6)
        .map((product) => ({ id: product.id, name: product.name, sku: product.sku, stock: num(product.stock), minStock: num(product.minStock) })),
      openOrders,
    };
  }

  async excel(input: { from?: string; to?: string; tab?: string; q?: string; admin: boolean }) {
    const tab = input.tab === 'vendidos' || input.tab === 'trabajadores' || input.tab === 'existencias' ? input.tab : 'general';
    const range = this.range(input.from, input.to);
    const from = ymd(range.gte);
    const to = ymd(range.lte);
    const span = from === to ? from : `${from}_a_${to}`;
    const names = {
      general: 'reporte-general',
      vendidos: 'reporte-vendidos',
      trabajadores: 'reporte-trabajadores',
      existencias: 'reporte-poco-stock',
    } as const;
    const buffer = await reportWorkbook({
      tab,
      from,
      to,
      admin: input.admin,
      ...(tab === 'general' ? await this.excelGeneral(input.from, input.to) : {}),
      ...(tab === 'vendidos' ? await this.excelSold(input.from, input.to) : {}),
      ...(tab === 'trabajadores' ? { workers: (await this.workers(input.from, input.to)).items } : {}),
      ...(tab === 'existencias' ? await this.excelLow(input.q) : {}),
    });
    return { name: `${names[tab]}-${tab === 'existencias' ? ymd(businessToday()) : span}.xlsx`, buffer };
  }

  private async excelGeneral(from?: string, to?: string) {
    const range = this.range(from, to);
    const [summary, sales, orders] = await Promise.all([
      this.summary(from, to),
      this.prisma.sale.findMany({
        where: { businessDate: range },
        orderBy: [{ businessDate: 'desc' }, { number: 'desc' }],
        include: { items: true },
      }),
      this.prisma.serviceOrder.findMany({
        where: { status: 'PAID', businessDate: range },
        orderBy: [{ businessDate: 'desc' }, { number: 'desc' }],
        include: { lines: true },
      }),
    ]);
    return {
      summary,
      sales: sales.map((row) => {
        const sign = row.kind === 'RETURN' ? -1 : 1;
        return {
          number: row.number,
          kind: row.kind,
          status: row.status,
          businessDate: ymd(row.businessDate),
          customerName: row.customerName,
          cashierName: row.cashierName,
          paymentMethod: row.paymentMethod,
          detail: row.items.map((item) => `${item.name} × ${num(item.quantity)}`).join(', '),
          total: money(sign * num(row.total)),
          profit: money(sign * num(row.profit)),
        };
      }),
      orders: orders.map((row) => ({
        number: row.number,
        businessDate: ymd(row.businessDate),
        customerName: row.customerName,
        plate: row.plate,
        cashierName: row.cashierName,
        paymentMethod: row.paymentMethod,
        detail: row.lines.map((line) => `${line.name} × ${num(line.quantity)}`).join(', '),
        total: num(row.total),
        profit: num(row.profit),
      })),
    };
  }

  private async excelSold(from?: string, to?: string) {
    const { productRows, serviceRows } = await this.soldGroups(from, to);
    return { products: productRows.map(roundGroup), servicesSold: serviceRows.map(roundGroup) };
  }

  private async excelLow(q?: string) {
    const matched = await this.lowMatches(q);
    const out = matched.filter((row) => num(row.stock) <= 0).length;
    return {
      low: matched.map((row) => ({
        sku: row.sku,
        name: row.name,
        category: row.category,
        stock: num(row.stock),
        minStock: num(row.minStock),
        missing: money(Math.max(0, num(row.minStock) - num(row.stock))),
        out: num(row.stock) <= 0,
      })),
      lowSummary: {
        low: matched.length,
        out,
        short: matched.length - out,
        missingCost: money(matched.reduce((sum, row) => sum + Math.max(0, num(row.minStock) - num(row.stock)) * num(row.cost), 0)),
      },
    };
  }

  private async soldGroups(from?: string, to?: string) {
    const range = this.range(from, to);
    const [saleItems, lines] = await Promise.all([
      this.prisma.saleItem.findMany({
        where: { sale: { status: 'PAID', businessDate: range } },
        select: { sku: true, name: true, quantity: true, amount: true, profit: true, sale: { select: { kind: true, cashierName: true } } },
      }),
      this.prisma.serviceOrderLine.findMany({
        where: { order: { status: 'PAID', businessDate: range } },
        select: { kind: true, code: true, name: true, quantity: true, amount: true, profit: true, order: { select: { cashierName: true } } },
      }),
    ]);
    const products = new Map<string, GroupRow>();
    const services = new Map<string, GroupRow>();
    for (const item of saleItems) {
      const sign = item.sale.kind === 'RETURN' ? -1 : 1;
      addGroup(products, item.sku || item.name, item.name, sign * num(item.quantity), sign * num(item.amount), sign * num(item.profit), item.sale.cashierName);
    }
    for (const line of lines) {
      const bucket = line.kind === 'PRODUCT' ? products : services;
      addGroup(bucket, line.code || line.name, line.name, num(line.quantity), num(line.amount), num(line.profit), line.order.cashierName);
    }
    const productRows = [...products.values()].sort((left, right) => right.total - left.total || right.quantity - left.quantity);
    const serviceRows = [...services.values()].sort((left, right) => right.total - left.total || right.quantity - left.quantity);
    return { productRows, serviceRows };
  }

  private async lowMatches(q?: string) {
    const term = q?.trim().toLowerCase();
    const rows = await this.prisma.$queryRaw<Array<{ id: number; sku: string; name: string; category: string | null; stock: number; minStock: number; cost: number; price: number }>>`
      SELECT id, sku, name, category,
        stock::float8 AS stock,
        "minStock"::float8 AS "minStock",
        cost::float8 AS cost,
        price::float8 AS price
      FROM products
      WHERE active = true AND stock <= "minStock"
      ORDER BY stock ASC, name ASC
    `;
    return rows.filter((row) => !term || row.name.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term));
  }

  private range(from?: string, to?: string) {
    const end = parseYmd(to) || businessToday();
    const start = parseYmd(from) || end;
    return { gte: start, lte: end };
  }
}

type Totals = {
  count: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  profit: number;
  cash: number;
  card: number;
  transfer: number;
};

type GroupRow = { code: string; name: string; quantity: number; total: number; profit: number; sellers: Map<string, number> };
type WorkerRow = {
  userId: number | null;
  name: string;
  username: string;
  role: 'ADMIN' | 'CASHIER' | null;
  active: boolean;
  salesTotal: number;
  salesCount: number;
  serviceTotal: number;
  serviceCount: number;
  profit: number;
  paid: number;
  sold: Map<string, number>;
};

function addGroup(bucket: Map<string, GroupRow>, code: string, name: string, quantity: number, total: number, profit: number, seller: string) {
  const current = bucket.get(code) || { code, name, quantity: 0, total: 0, profit: 0, sellers: new Map<string, number>() };
  current.quantity += quantity;
  current.total += total;
  current.profit += profit;
  const who = seller || 'Sin vendedor';
  current.sellers.set(who, (current.sellers.get(who) || 0) + quantity);
  bucket.set(code, current);
}

function roundGroup(row: GroupRow) {
  return {
    code: row.code,
    name: row.name,
    quantity: money(row.quantity),
    total: money(row.total),
    profit: money(row.profit),
    sellers: [...row.sellers.entries()]
      .map(([name, quantity]) => ({ name, quantity: money(quantity) }))
      .filter((seller) => seller.quantity !== 0)
      .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, 'es')),
  };
}

function sumGroup(rows: GroupRow[]) {
  return {
    quantity: money(rows.reduce((sum, row) => sum + row.quantity, 0)),
    total: money(rows.reduce((sum, row) => sum + row.total, 0)),
    profit: money(rows.reduce((sum, row) => sum + row.profit, 0)),
  };
}

function emptyTotals(): Totals {
  return { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, profit: 0, cash: 0, card: 0, transfer: 0 };
}

function roundTotals(row: Totals) {
  return {
    count: row.count,
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    tax: money(row.tax),
    total: money(row.total),
    profit: money(row.profit),
    cash: money(row.cash),
    card: money(row.card),
    transfer: money(row.transfer),
  };
}

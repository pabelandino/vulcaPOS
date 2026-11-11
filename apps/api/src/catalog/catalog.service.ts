import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { num } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { moveStock } from '../common/stock';
import { PrismaService } from '../prisma/prisma.service';

type Query = { page?: string; pageSize?: string; q?: string };

@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async products(query: Query & { barcode?: string; all?: string; maxStock?: string; low?: string }) {
    const page = pageArgs(query);
    const term = query.q?.trim();
    const maxStock = query.maxStock?.trim();
    const maxNumber = maxStock ? Number(maxStock) : undefined;
    const lowIds = query.low === '1' ? await this.lowStockIds() : undefined;
    const where: Prisma.ProductWhereInput = {
      ...(query.all === '1' ? {} : { active: true }),
      ...(lowIds ? { id: { in: lowIds.length ? lowIds : [-1] } } : {}),
      ...(Number.isFinite(maxNumber) ? { stock: { lte: maxNumber } } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { sku: { contains: term, mode: 'insensitive' } },
              { barcode: { contains: term, mode: 'insensitive' } },
              { category: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total, stock] = await Promise.all([
      this.prisma.product.findMany({ where, skip: page.skip, take: page.take, orderBy: { name: 'asc' }, include: { supplier: true } }),
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where: { active: true }, select: { stock: true, cost: true, minStock: true, price: true } }),
    ]);
    const summary = stock.reduce(
      (acc, item) => {
        acc.skus += 1;
        acc.stockValue = acc.stockValue + num(item.cost) * num(item.stock);
        acc.retailValue = acc.retailValue + num(item.price) * num(item.stock);
        if (num(item.stock) <= num(item.minStock)) acc.low += 1;
        return acc;
      },
      { skus: 0, stockValue: 0, retailValue: 0, low: 0 },
    );
    return pageOf(rows.map(mapProduct), total, page.page, page.pageSize, { summary });
  }

  async saveProduct(id: number | null, body: ProductBody) {
    if (!body.name?.trim()) throw new BadRequestException('El nombre es obligatorio');
    const sku = body.sku?.trim() || (await nextCode(body.name, (code) => this.prisma.product.findUnique({ where: { sku: code } })));
    const data = {
      sku,
      barcode: body.barcode?.trim() || null,
      name: body.name.trim(),
      category: body.category?.trim() || null,
      unit: body.unit?.trim() || 'UND',
      cost: roundInput(body.cost),
      price: roundInput(body.price),
      stock: roundInput(body.stock),
      minStock: roundInput(body.minStock),
      supplierId: body.supplierId || null,
      active: body.active !== false,
    };
    try {
      const row = id
        ? await this.prisma.product.update({ where: { id }, data, include: { supplier: true } })
        : await this.prisma.product.create({ data, include: { supplier: true } });
      return mapProduct(row);
    } catch {
      throw new BadRequestException('SKU o código de barras ya existe');
    }
  }

  async adjustStock(id: number, stock: number, reason: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const next = roundInput(stock);
    if (next < 0) throw new BadRequestException('La existencia no puede ser negativa');
    const delta = next - num(product.stock);
    const [row] = await this.prisma.$transaction([
      this.prisma.product.update({ where: { id }, data: { stock: next }, include: { supplier: true } }),
      this.prisma.stockMove.create({ data: { productId: id, qty: delta, reason: reason?.trim() || 'Ajuste', ref: 'ADJUST' } }),
    ]);
    return mapProduct(row);
  }

  async services(query: Query & { all?: string }) {
    const page = pageArgs(query);
    const term = query.q?.trim();
    const where: Prisma.ServiceItemWhereInput = {
      ...(query.all === '1' ? {} : { active: true }),
      ...(term
        ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { code: { contains: term, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total, all] = await Promise.all([
      this.prisma.serviceItem.findMany({ where, skip: page.skip, take: page.take, orderBy: { name: 'asc' } }),
      this.prisma.serviceItem.count({ where }),
      this.prisma.serviceItem.findMany({ where: { active: true }, select: { price: true } }),
    ]);
    const average = all.length ? all.reduce((sum, row) => sum + num(row.price), 0) / all.length : 0;
    return pageOf(rows.map(mapService), total, page.page, page.pageSize, {
      summary: { active: all.length, average },
    });
  }

  async saveService(id: number | null, body: ServiceBody) {
    if (!body.name?.trim()) throw new BadRequestException('El nombre del servicio es obligatorio');
    const current = id ? await this.prisma.serviceItem.findUnique({ where: { id } }) : null;
    const code = body.code?.trim().toUpperCase() || current?.code || (await nextCode(body.name, (value) => this.prisma.serviceItem.findUnique({ where: { code: value } })));
    const data = {
      code,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      price: roundInput(body.price),
      cost: roundInput(body.cost),
      workerAmount: body.workerAmount == null && current ? num(current.workerAmount) : roundInput(body.workerAmount),
      active: body.active !== false,
    };
    try {
      const row = id
        ? await this.prisma.serviceItem.update({ where: { id }, data })
        : await this.prisma.serviceItem.create({ data });
      return mapService(row);
    } catch {
      throw new BadRequestException('Ese código de servicio ya existe');
    }
  }

  async customers(query: Query) {
    const page = pageArgs(query);
    const term = query.q?.trim();
    const where: Prisma.CustomerWhereInput = term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
            { plate: { contains: term, mode: 'insensitive' } },
            { ruc: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip: page.skip, take: page.take, orderBy: { name: 'asc' } }),
      this.prisma.customer.count({ where }),
    ]);
    return pageOf(rows, total, page.page, page.pageSize, { summary: { count: total } });
  }

  async saveCustomer(id: number | null, body: CustomerBody) {
    if (!body.name?.trim()) throw new BadRequestException('El nombre del cliente es obligatorio');
    const data = {
      name: body.name.trim(),
      phone: empty(body.phone),
      ruc: empty(body.ruc),
      plate: empty(body.plate)?.toUpperCase() || null,
      vehicle: empty(body.vehicle),
      notes: empty(body.notes),
    };
    return id
      ? this.prisma.customer.update({ where: { id }, data })
      : this.prisma.customer.create({ data });
  }

  async suppliers(query: Query) {
    const page = pageArgs(query);
    const term = query.q?.trim();
    const where: Prisma.SupplierWhereInput = term
      ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip: page.skip, take: page.take, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);
    return pageOf(rows, total, page.page, page.pageSize, { summary: { count: total } });
  }

  async saveSupplier(id: number | null, body: SupplierBody) {
    if (!body.name?.trim()) throw new BadRequestException('El nombre del proveedor es obligatorio');
    const data = {
      name: body.name.trim(),
      contact: empty(body.contact),
      phone: empty(body.phone),
      ruc: empty(body.ruc),
      address: empty(body.address),
      email: empty(body.email),
    };
    return id ? this.prisma.supplier.update({ where: { id }, data }) : this.prisma.supplier.create({ data });
  }

  async branches() {
    const rows = await this.prisma.branch.findMany({
      orderBy: { name: 'asc' },
      include: { registers: { orderBy: { name: 'asc' } }, _count: { select: { sales: true, orders: true } } },
    });
    return rows.map((row) => ({
      ...row,
      sales: row._count.sales,
      orders: row._count.orders,
    }));
  }

  async saveBranch(id: number | null, body: { name?: string; address?: string; phone?: string; active?: boolean }) {
    if (!body.name?.trim()) throw new BadRequestException('El nombre de la sucursal es obligatorio');
    const data = { name: body.name.trim(), address: empty(body.address), phone: empty(body.phone), active: body.active !== false };
    return id ? this.prisma.branch.update({ where: { id }, data }) : this.prisma.branch.create({ data });
  }

  async saveRegister(id: number | null, body: { branchId?: number; name?: string; active?: boolean }) {
    if (!body.name?.trim() || !body.branchId) throw new BadRequestException('La caja necesita sucursal y nombre');
    const data = { branchId: body.branchId, name: body.name.trim(), active: body.active !== false };
    return id ? this.prisma.register.update({ where: { id }, data }) : this.prisma.register.create({ data });
  }

  async movements(query: Query) {
    const page = pageArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.stockMove.findMany({
        skip: page.skip,
        take: page.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMove.count(),
    ]);
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((row) => row.productId) } },
      select: { id: true, name: true, sku: true },
    });
    const names = new Map(products.map((product) => [product.id, product]));
    return pageOf(
      rows.map((row) => ({ ...row, qty: num(row.qty), product: names.get(row.productId) || null })),
      total,
      page.page,
      page.pageSize,
    );
  }

  async topSellers(limit = 10) {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, sale: { kind: 'SALE', status: 'PAID' } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const ids = grouped.map((row) => row.productId).filter((id): id is number => id != null);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, active: true },
      include: { supplier: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const ranked = grouped.flatMap((row) => {
      const product = row.productId ? byId.get(row.productId) : undefined;
      if (!product) return [];
      return [{ ...mapProduct(product), sold: num(row._sum.quantity || 0) }];
    });
    if (ranked.length) return ranked;
    const fallback = await this.prisma.product.findMany({
      where: { active: true },
      include: { supplier: true },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return fallback.map((row) => ({ ...mapProduct(row), sold: 0 }));
  }

  async receipts(query: Query) {
    const page = pageArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        skip: page.skip,
        take: page.take,
        orderBy: { createdAt: 'desc' },
        include: receiptInclude,
      }),
      this.prisma.goodsReceipt.count(),
    ]);
    const pageCost = rows.reduce((sum, row) => sum + receiptCost(row), 0);
    return pageOf(rows.map(mapReceipt), total, page.page, page.pageSize, { summary: { count: total, pageCost } });
  }

  async createReceipt(userId: number, body: ReceiptBody) {
    const invoiceNumber = body.invoiceNumber?.trim();
    if (!invoiceNumber) throw new BadRequestException('Escriba el número de factura');
    const incoming = body.lines || [];
    if (!incoming.length) throw new BadRequestException('Agregue al menos un producto a la factura');
    const merged = new Map<number, { productId: number; quantity: number; cost: number; price: number }>();
    for (const line of incoming) {
      const quantity = roundInput(line.quantity);
      if (!line.productId || quantity <= 0) throw new BadRequestException('Cada línea necesita un producto y una cantidad');
      const previous = merged.get(line.productId);
      merged.set(line.productId, {
        productId: line.productId,
        quantity: roundInput((previous?.quantity || 0) + quantity),
        cost: roundInput(line.cost),
        price: roundInput(line.price),
      });
    }
    const lines = [...merged.values()];
    const receipt = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product || !product.active) throw new BadRequestException('Hay un producto inactivo o inexistente');
        const next: { cost?: number; price?: number } = {};
        if (Math.abs(line.cost - num(product.cost)) > 0.009) next.cost = line.cost;
        if (Math.abs(line.price - num(product.price)) > 0.009) next.price = line.price;
        if (next.cost != null || next.price != null) {
          await tx.product.update({ where: { id: product.id }, data: next });
        }
        await moveStock(tx, product.id, -line.quantity, 'Ingreso de factura', invoiceNumber);
      }
      return tx.goodsReceipt.create({
        data: {
          invoiceNumber,
          supplierId: body.supplierId || null,
          supplierName: body.supplierName?.trim() || null,
          notes: body.notes?.trim() || null,
          userId,
          lines: { create: lines },
        },
        include: receiptInclude,
      });
    });
    return mapReceipt(receipt);
  }

  private async lowStockIds() {
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>`SELECT id FROM products WHERE stock <= "minStock"`;
    return rows.map((row) => Number(row.id));
  }
}

async function nextCode(name: string | undefined, exists: (code: string) => Promise<unknown>) {
  const stem = (name || 'ITEM')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 10)
    .toUpperCase() || 'ITEM';
  for (let number = 1; number < 1000; number += 1) {
    const code = `${stem}-${String(number).padStart(3, '0')}`;
    if (!(await exists(code))) return code;
  }
  throw new BadRequestException('No se pudo generar un código único');
}

function empty(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

function roundInput(value?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

type ProductRow = Prisma.ProductGetPayload<{ include: { supplier: true } }>;

function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    category: row.category,
    unit: row.unit,
    cost: num(row.cost),
    price: num(row.price),
    stock: num(row.stock),
    minStock: num(row.minStock),
    supplierId: row.supplierId,
    supplierName: row.supplier?.name || null,
    active: row.active,
    low: num(row.stock) <= num(row.minStock),
  };
}

function mapService(row: { id: number; code: string; name: string; description: string | null; price: Prisma.Decimal; cost: Prisma.Decimal; workerAmount: Prisma.Decimal; active: boolean }) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    price: num(row.price),
    cost: num(row.cost),
    workerAmount: num(row.workerAmount),
    active: row.active,
  };
}

type ProductBody = {
  sku?: string;
  barcode?: string;
  name?: string;
  category?: string;
  unit?: string;
  cost?: number;
  price?: number;
  stock?: number;
  minStock?: number;
  supplierId?: number | null;
  active?: boolean;
};

type ServiceBody = {
  code?: string;
  name?: string;
  description?: string;
  price?: number;
  cost?: number;
  workerAmount?: number;
  active?: boolean;
};

type CustomerBody = { name?: string; phone?: string; ruc?: string; plate?: string; vehicle?: string; notes?: string };
type SupplierBody = { name?: string; contact?: string; phone?: string; ruc?: string; address?: string; email?: string };
type ReceiptBody = {
  invoiceNumber?: string;
  supplierId?: number | null;
  supplierName?: string;
  notes?: string;
  lines?: Array<{ productId?: number; quantity?: number; cost?: number; price?: number }>;
};

const receiptInclude = {
  lines: { include: { product: true } },
  supplier: true,
  user: true,
} satisfies Prisma.GoodsReceiptInclude;

type ReceiptRow = Prisma.GoodsReceiptGetPayload<{ include: typeof receiptInclude }>;

function receiptCost(row: ReceiptRow) {
  return row.lines.reduce((sum, line) => sum + num(line.cost) * num(line.quantity), 0);
}

function mapReceipt(row: ReceiptRow) {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    supplierName: row.supplier?.name || row.supplierName,
    notes: row.notes,
    createdAt: row.createdAt,
    userName: row.user.name,
    totalCost: receiptCost(row),
    lines: row.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      name: line.product.name,
      sku: line.product.sku,
      quantity: num(line.quantity),
      cost: num(line.cost),
      price: num(line.price),
    })),
  };
}

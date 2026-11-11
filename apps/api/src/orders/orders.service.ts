import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BroughtItem, LineKind, PaymentMethod, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { businessToday, parseYmd } from '../common/dates';
import { lineAmount, money, num, paymentParts, priceTotals } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { moveStock } from '../common/stock';
import { CashService } from '../cash/cash.service';
import { PrismaService } from '../prisma/prisma.service';

export type OrderLineInput = {
  kind?: LineKind;
  productId?: number;
  serviceId?: number;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
};

export type OrderInput = {
  clientUuid?: string;
  customerId?: number | null;
  customerName?: string;
  phone?: string;
  plate?: string;
  vehicle?: string;
  brought?: BroughtItem;
  broughtNote?: string;
  discount?: number;
  notes?: string;
  pay?: boolean;
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  transferAmount?: number;
  lines?: OrderLineInput[];
};

const orderInclude = { lines: true, branch: true, register: true } satisfies Prisma.ServiceOrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CashService) private readonly cash: CashService,
  ) {}

  async list(query: { page?: string; pageSize?: string; q?: string; from?: string; to?: string; status?: string }) {
    const page = pageArgs(query);
    const from = parseYmd(query.from);
    const to = parseYmd(query.to);
    const term = query.q?.trim();
    const status = query.status === 'OPEN' || query.status === 'PAID' || query.status === 'VOID' ? query.status : undefined;
    const where: Prisma.ServiceOrderWhereInput = {
      ...(status ? { status } : {}),
      ...(from || to ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(term
        ? {
            OR: [
              { customerName: { contains: term, mode: 'insensitive' } },
              { plate: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term, mode: 'insensitive' } },
              { broughtNote: { contains: term, mode: 'insensitive' } },
              ...(Number(term) ? [{ number: Number(term) }] : []),
            ],
          }
        : {}),
    };
    const [rows, total, openRows, paidToday] = await Promise.all([
      this.prisma.serviceOrder.findMany({ where, include: orderInclude, orderBy: [{ status: 'asc' }, { number: 'desc' }], skip: page.skip, take: page.take }),
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.findMany({ where: { status: 'OPEN' }, select: { total: true } }),
      this.prisma.serviceOrder.aggregate({
        where: { status: 'PAID', businessDate: businessToday() },
        _sum: { total: true },
        _count: true,
      }),
    ]);
    return pageOf(rows.map((row) => mapOrder(row)), total, page.page, page.pageSize, {
      summary: {
        open: openRows.length,
        openTotal: money(openRows.reduce((sum, row) => sum + num(row.total), 0)),
        paidToday: paidToday._count,
        paidTodayTotal: num(paidToday._sum.total),
      },
    });
  }

  async get(id: number) {
    const order = await this.prisma.serviceOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Orden no encontrada');
    return this.present(order);
  }

  async create(user: AuthUser, input: OrderInput) {
    if (input.clientUuid) {
      const existing = await this.prisma.serviceOrder.findUnique({ where: { clientUuid: input.clientUuid }, include: orderInclude });
      if (existing) return this.present(existing);
    }
    const order = await this.persist(user, null, input, await this.sessionFor(user.sub, !!input.pay));
    return this.present(order);
  }

  async update(user: AuthUser, id: number, input: OrderInput) {
    const order = await this.persist(user, id, input, await this.sessionFor(user.sub, !!input.pay));
    return this.present(order);
  }

  async pay(user: AuthUser, id: number, input: OrderInput) {
    const order = await this.persist(user, id, { ...input, pay: true }, await this.sessionFor(user.sub, true));
    return this.present(order);
  }

  private async sessionFor(userId: number, required: boolean) {
    if (required) {
      const session = await this.cash.requireOpen(userId);
      return { id: session.id, registerId: session.registerId, register: { branchId: session.register.branchId } };
    }
    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      include: { register: true },
    });
    if (!session) return null;
    return { id: session.id, registerId: session.registerId, register: { branchId: session.register.branchId } };
  }

  async voidOrder(id: number) {
    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.serviceOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!current || current.status === 'VOID') throw new BadRequestException('La orden no se puede anular');
      await applyStock(tx, qtyMap(current.lines), new Map(), `ORDEN ${current.number}`);
      return tx.serviceOrder.update({ where: { id }, data: { status: 'VOID' }, include: orderInclude });
    });
    return mapOrder(order);
  }

  private async persist(
    user: AuthUser,
    id: number | null,
    input: OrderInput,
    session: { id: number; registerId: number; register: { branchId: number } } | null,
  ) {
    this.assertBrought(input);
    const lines = input.lines || [];
    if (!lines.length) throw new BadRequestException('Agregue un servicio o un producto');
    const company = await this.prisma.company.findFirst();
    const taxRate = num(company?.taxRate ?? 15);
    const pricesIncludeTax = company?.pricesIncludeTax ?? true;
    return this.prisma.$transaction(async (tx) => {
      const current = id ? await tx.serviceOrder.findUnique({ where: { id }, include: { lines: true } }) : null;
      if (id && (!current || current.status !== 'OPEN')) throw new BadRequestException('Solo se editan órdenes abiertas');
      const priced = await this.priceLines(tx, lines);
      const totals = priceTotals(priced, Number(input.discount) || 0, taxRate, pricesIncludeTax);
      const customerId = await this.ensureCustomer(tx, input);
      await applyStock(tx, qtyMap(current?.lines || []), qtyMap(priced), `ORDEN ${current?.number || 'nueva'}`);
      const pay = input.pay
        ? safePay(input.paymentMethod, totals.total, input)
        : { cashAmount: 0, cardAmount: 0, transferAmount: 0, changeAmount: 0 };
      const data = {
        customerId,
        customerName: input.customerName?.trim() || 'Cliente mostrador',
        phone: input.phone?.trim() || null,
        plate: input.plate?.trim().toUpperCase() || null,
        vehicle: input.vehicle?.trim() || null,
        brought: input.brought || 'NONE',
        broughtNote: input.broughtNote?.trim() || null,
        paymentMethod: input.pay ? input.paymentMethod || 'CASH' : null,
        ...pay,
        ...totals,
        notes: input.notes?.trim() || null,
        branchId: session?.register.branchId || current?.branchId || null,
        registerId: session?.registerId || current?.registerId || null,
        cashSessionId: input.pay ? session?.id || null : current?.cashSessionId || null,
        cashierId: user.sub,
        cashierName: user.name,
        status: input.pay ? 'PAID' as const : 'OPEN' as const,
        paidAt: input.pay ? new Date() : null,
      };
      const lineData = priced.map((line) => ({
        kind: line.kind,
        productId: line.productId,
        serviceId: line.serviceId,
        code: line.code,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        discount: line.discount,
        amount: lineAmount(line),
        profit: money((line.unitPrice - line.unitCost) * line.quantity - line.discount),
      }));
      if (!current) {
        const number = await nextOrderNumber(tx);
        return tx.serviceOrder.create({
          data: {
            number,
            clientUuid: input.clientUuid || null,
            businessDate: businessToday(),
            ...data,
            lines: { create: lineData },
          },
          include: orderInclude,
        });
      }
      await tx.serviceOrderLine.deleteMany({ where: { orderId: current.id } });
      return tx.serviceOrder.update({
        where: { id: current.id },
        data: { ...data, lines: { create: lineData } },
        include: orderInclude,
      });
    });
  }

  private async present(order: Prisma.ServiceOrderGetPayload<{ include: typeof orderInclude }>) {
    const ids = [...new Set(order.lines.map((line) => line.productId).filter((id): id is number => id != null))];
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true } })
      : [];
    return mapOrder(order, new Map(products.map((product) => [product.id, num(product.stock)])));
  }

  private assertBrought(input: OrderInput) {
    const brought = input.brought || 'NONE';
    if ((brought === 'TIRE' || brought === 'OTHER') && (input.broughtNote || '').trim().length < 3) {
      throw new BadRequestException(brought === 'TIRE' ? 'Describa la llanta que trae el cliente' : 'Describa el producto que trae el cliente');
    }
  }

  private async ensureCustomer(tx: Prisma.TransactionClient, input: OrderInput) {
    if (input.customerId) return input.customerId;
    const name = input.customerName?.trim();
    const generic = ['cliente mostrador', 'cliente general', 'consumidor final'];
    if (!name || generic.includes(name.toLowerCase())) return null;
    const plate = input.plate?.trim().toUpperCase();
    const existing = plate
      ? await tx.customer.findFirst({ where: { plate: { equals: plate, mode: 'insensitive' } } })
      : await tx.customer.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, phone: input.phone?.trim() || undefined } });
    if (existing) return existing.id;
    const created = await tx.customer.create({
      data: {
        name,
        phone: input.phone?.trim() || null,
        plate: plate || null,
        vehicle: input.vehicle?.trim() || null,
      },
    });
    return created.id;
  }

  private async priceLines(tx: Prisma.TransactionClient, lines: OrderLineInput[]) {
    const priced = [];
    for (const line of lines) {
      const quantity = money(Number(line.quantity) || 0);
      if (quantity <= 0) throw new BadRequestException('Hay una línea con cantidad inválida');
      const discount = money(Math.max(0, Number(line.discount) || 0));
      if (line.kind === 'SERVICE' || line.serviceId) {
        if (!line.serviceId) throw new BadRequestException('Falta el servicio');
        const service = await tx.serviceItem.findUnique({ where: { id: line.serviceId } });
        if (!service || !service.active) throw new BadRequestException('Hay un servicio inactivo o inexistente');
        const unitPrice = money(Math.max(0, Number(line.unitPrice ?? num(service.price))));
        priced.push({
          kind: 'SERVICE' as const,
          productId: null,
          serviceId: service.id,
          code: service.code,
          name: service.name,
          quantity,
          unitPrice,
          unitCost: num(service.cost),
          discount,
        });
        continue;
      }
      if (!line.productId) throw new BadRequestException('Falta el producto del servicio');
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      if (!product || !product.active) throw new BadRequestException('Hay un producto inactivo o inexistente');
      const unitPrice = money(Math.max(0, Number(line.unitPrice ?? num(product.price))));
      priced.push({
        kind: 'PRODUCT' as const,
        productId: product.id,
        serviceId: null,
        code: product.sku,
        name: product.name,
        quantity,
        unitPrice,
        unitCost: num(product.cost),
        discount,
      });
    }
    return priced;
  }
}

function qtyMap(lines: Array<{ kind?: string; productId?: number | null; quantity: Prisma.Decimal | number }>) {
  const map = new Map<number, number>();
  for (const line of lines) {
    if ((line.kind === 'PRODUCT' || line.productId) && line.productId) {
      map.set(line.productId, money((map.get(line.productId) || 0) + num(line.quantity)));
    }
  }
  return map;
}

async function applyStock(tx: Prisma.TransactionClient, before: Map<number, number>, after: Map<number, number>, ref: string) {
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    const delta = money((after.get(id) || 0) - (before.get(id) || 0));
    if (delta) await moveStock(tx, id, delta, delta > 0 ? 'Orden de servicio' : 'Ajuste de orden', ref);
  }
}

async function nextOrderNumber(tx: Prisma.TransactionClient) {
  const last = await tx.serviceOrder.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number || 5000) + 1;
}

function safePay(method: PaymentMethod | undefined, total: number, input: OrderInput) {
  try {
    return paymentParts(method || 'CASH', total, Number(input.cashAmount) || 0, Number(input.cardAmount) || 0, Number(input.transferAmount) || 0);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'Pago inválido');
  }
}

function mapOrder(row: Prisma.ServiceOrderGetPayload<{ include: typeof orderInclude }>, stocks?: Map<number, number>) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    businessDate: row.businessDate,
    customerId: row.customerId,
    customerName: row.customerName,
    phone: row.phone,
    plate: row.plate,
    vehicle: row.vehicle,
    brought: row.brought,
    broughtNote: row.broughtNote,
    paymentMethod: row.paymentMethod,
    cashAmount: num(row.cashAmount),
    cardAmount: num(row.cardAmount),
    transferAmount: num(row.transferAmount),
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    total: num(row.total),
    profit: num(row.profit),
    changeAmount: num(row.changeAmount),
    notes: row.notes,
    cashierName: row.cashierName,
    branchName: row.branch?.name || null,
    registerName: row.register?.name || null,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      productId: line.productId,
      serviceId: line.serviceId,
      code: line.code,
      name: line.name,
      quantity: num(line.quantity),
      stock: line.productId == null || !stocks ? null : money((stocks.get(line.productId) || 0) + (row.status === 'OPEN' ? num(line.quantity) : 0)),
      unitPrice: num(line.unitPrice),
      unitCost: num(line.unitCost),
      discount: num(line.discount),
      amount: num(line.amount),
      profit: num(line.profit),
    })),
  };
}

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, SaleKind } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { businessToday, parseYmd } from '../common/dates';
import { lineAmount, money, num, paymentParts, priceTotals } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { moveStock } from '../common/stock';
import { CashService } from '../cash/cash.service';
import { PrismaService } from '../prisma/prisma.service';

export type SaleLineInput = { productId?: number; quantity?: number; unitPrice?: number; discount?: number };
export type PayInput = {
  clientUuid?: string;
  customerId?: number | null;
  customerName?: string;
  plate?: string;
  vehicle?: string;
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  transferAmount?: number;
  discount?: number;
  notes?: string;
  lines?: SaleLineInput[];
};

const saleInclude = { items: true, branch: true, register: true } satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CashService) private readonly cash: CashService,
  ) {}

  async list(query: { page?: string; pageSize?: string; q?: string; from?: string; to?: string; kind?: string }) {
    const page = pageArgs(query);
    const from = parseYmd(query.from);
    const to = parseYmd(query.to);
    const term = query.q?.trim();
    const where: Prisma.SaleWhereInput = {
      ...(query.kind === 'SALE' || query.kind === 'RETURN' ? { kind: query.kind } : {}),
      ...(from || to ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(term
        ? {
            OR: [
              { customerName: { contains: term, mode: 'insensitive' } },
              { cashierName: { contains: term, mode: 'insensitive' } },
              { plate: { contains: term, mode: 'insensitive' } },
              ...(Number(term) ? [{ number: Number(term) }] : []),
            ],
          }
        : {}),
    };
    const [rows, total, sums] = await Promise.all([
      this.prisma.sale.findMany({ where, include: saleInclude, orderBy: [{ businessDate: 'desc' }, { number: 'desc' }], skip: page.skip, take: page.take }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({ where: { ...where, status: 'PAID' }, select: { kind: true, subtotal: true, discount: true, tax: true, total: true, profit: true } }),
    ]);
    const summary = sums.reduce(
      (acc, row) => {
        const sign = row.kind === 'RETURN' ? -1 : 1;
        acc.count += 1;
        acc.subtotal += sign * num(row.subtotal);
        acc.discount += sign * num(row.discount);
        acc.tax += sign * num(row.tax);
        acc.total += sign * num(row.total);
        acc.profit += sign * num(row.profit);
        return acc;
      },
      { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, profit: 0 },
    );
    const pageSubtotal = rows.filter((row) => row.status === 'PAID').reduce((sum, row) => sum + (row.kind === 'RETURN' ? -1 : 1) * num(row.total), 0);
    return pageOf(rows.map(mapSale), total, page.page, page.pageSize, { summary, pageSubtotal: money(pageSubtotal) });
  }

  async get(id: number) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return mapSale(sale);
  }

  async create(user: AuthUser, input: PayInput) {
    if (input.clientUuid) {
      const existing = await this.prisma.sale.findUnique({ where: { clientUuid: input.clientUuid }, include: saleInclude });
      if (existing) return mapSale(existing);
    }
    const lines = input.lines || [];
    if (!lines.length) throw new BadRequestException('Agregue al menos un producto');
    const session = await this.cash.requireOpen(user.sub);
    const company = await this.companyTax();
    try {
      const sale = await this.prisma.$transaction(async (tx) => {
        const priced = await this.priceLines(tx, lines);
        const totals = priceTotals(priced, Number(input.discount) || 0, company.taxRate, company.pricesIncludeTax);
        const pay = safePay(input.paymentMethod, totals.total, input);
        const number = await nextNumber(tx);
        const requested = new Map<number, { name: string; quantity: number }>();
        for (const line of priced) {
          const current = requested.get(line.productId) || { name: line.name, quantity: 0 };
          current.quantity = money(current.quantity + line.quantity);
          requested.set(line.productId, current);
        }
        for (const [productId, line] of requested) {
          await moveStock(tx, productId, line.quantity, 'Venta', `SALE ${number}`);
        }
        return tx.sale.create({
          data: {
            number,
            clientUuid: input.clientUuid || null,
            kind: 'SALE',
            businessDate: businessToday(),
            customerId: input.customerId || null,
            customerName: input.customerName?.trim() || 'Consumidor final',
            plate: input.plate?.trim() || null,
            vehicle: input.vehicle?.trim() || null,
            paymentMethod: input.paymentMethod || 'CASH',
            ...pay,
            ...totals,
            notes: input.notes?.trim() || null,
            branchId: session.register.branchId,
            registerId: session.registerId,
            cashSessionId: session.id,
            cashierId: user.sub,
            cashierName: user.name,
            items: {
              create: priced.map((line) => ({
                productId: line.productId,
                sku: line.sku,
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                unitCost: line.unitCost,
                discount: line.discount || 0,
                amount: lineAmount(line),
                profit: money((line.unitPrice - line.unitCost) * line.quantity - (line.discount || 0)),
              })),
            },
          },
          include: saleInclude,
        });
      });
      return mapSale(sale);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.message.startsWith('El ')) throw new BadRequestException(error.message);
      throw error;
    }
  }

  async returnSale(user: AuthUser, saleId: number, body: { lines?: { saleItemId?: number; quantity?: number }[]; paymentMethod?: PaymentMethod; cashAmount?: number; cardAmount?: number; transferAmount?: number }) {
    const session = await this.cash.requireOpen(user.sub);
    const company = await this.companyTax();
    const sale = await this.prisma.$transaction(async (tx) => {
      const original = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!original || original.kind !== 'SALE' || original.status !== 'PAID') {
        throw new BadRequestException('Solo se pueden devolver ventas pagadas');
      }
      const requested = body.lines || [];
      if (!requested.length) throw new BadRequestException('Indique qué productos regresan');
      const priced: Array<{ productId: number; sku: string; name: string; quantity: number; unitPrice: number; unitCost: number; discount: number }> = [];
      for (const request of requested) {
        const item = original.items.find((row) => row.id === request.saleItemId);
        if (!item || !item.productId) throw new BadRequestException('Hay un producto de la devolución que no existe');
        const quantity = money(Number(request.quantity) || 0);
        const remaining = money(num(item.quantity) - num(item.returnedQty));
        if (quantity <= 0 || quantity - remaining > 0.001) {
          throw new BadRequestException(`La cantidad a devolver de ${item.name} no es válida`);
        }
        const share = quantity / num(item.quantity);
        priced.push({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity,
          unitPrice: num(item.unitPrice),
          unitCost: num(item.unitCost),
          discount: money(num(item.discount) * share),
        });
        await tx.saleItem.update({ where: { id: item.id }, data: { returnedQty: { increment: quantity } } });
        await moveStock(tx, item.productId, -quantity, 'Devolución', `SALE ${original.number}`);
      }
      const gross = money(priced.reduce((sum, line) => sum + lineAmount(line), 0));
      const proportion = num(original.subtotal) === 0 ? 0 : gross / num(original.subtotal);
      const discount = money(num(original.discount) * proportion);
      const totals = priceTotals(priced, discount, company.taxRate, company.pricesIncludeTax);
      const pay = safePay(body.paymentMethod || 'CASH', totals.total, body);
      const number = await nextNumber(tx);
      return tx.sale.create({
        data: {
          number,
          kind: 'RETURN',
          businessDate: businessToday(),
          customerId: original.customerId,
          customerName: original.customerName,
          plate: original.plate,
          vehicle: original.vehicle,
          paymentMethod: body.paymentMethod || 'CASH',
          ...pay,
          ...totals,
          notes: `Devolución de venta ${original.number}`,
          branchId: session.register.branchId,
          registerId: session.registerId,
          cashSessionId: session.id,
          cashierId: user.sub,
          cashierName: user.name,
          relatedSaleId: original.id,
          items: {
            create: priced.map((line) => ({
              productId: line.productId,
              sku: line.sku,
              name: line.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              discount: line.discount,
              amount: lineAmount(line),
              profit: money((line.unitPrice - line.unitCost) * line.quantity - line.discount),
            })),
          },
        },
        include: saleInclude,
      });
    });
    return mapSale(sale);
  }

  async voidSale(id: number) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const original = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!original || original.status !== 'PAID' || original.kind !== 'SALE') {
        throw new BadRequestException('Esa venta no se puede anular');
      }
      if (original.items.some((item) => num(item.returnedQty) > 0)) {
        throw new BadRequestException('La venta ya tiene devoluciones. No se puede anular completa.');
      }
      for (const item of original.items) {
        if (item.productId) await moveStock(tx, item.productId, -num(item.quantity), 'Anulación', `SALE ${original.number}`);
      }
      return tx.sale.update({ where: { id }, data: { status: 'VOID' }, include: saleInclude });
    });
    return mapSale(sale);
  }

  private async companyTax() {
    const company = await this.prisma.company.findFirst();
    return { taxRate: num(company?.taxRate ?? 15), pricesIncludeTax: company?.pricesIncludeTax ?? true };
  }

  private async priceLines(tx: Prisma.TransactionClient, lines: SaleLineInput[]) {
    const priced = [];
    for (const line of lines) {
      if (!line.productId) throw new BadRequestException('Falta el producto');
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      if (!product || !product.active) throw new BadRequestException('Hay un producto inactivo o inexistente');
      const quantity = money(Number(line.quantity) || 0);
      if (quantity <= 0) throw new BadRequestException(`Cantidad inválida para ${product.name}`);
      const unitPrice = money(Math.max(0, Number(line.unitPrice ?? num(product.price))));
      const discount = money(Math.max(0, Number(line.discount) || 0));
      if (discount > unitPrice * quantity) throw new BadRequestException(`El descuento de ${product.name} supera el importe`);
      priced.push({
        productId: product.id,
        sku: product.sku,
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

async function nextNumber(tx: Prisma.TransactionClient) {
  const last = await tx.sale.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number || 1000) + 1;
}

function safePay(method: PaymentMethod | undefined, total: number, input: { cashAmount?: number; cardAmount?: number; transferAmount?: number }) {
  try {
    return paymentParts(method || 'CASH', total, Number(input.cashAmount) || 0, Number(input.cardAmount) || 0, Number(input.transferAmount) || 0);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'Pago inválido');
  }
}

function mapSale(row: Prisma.SaleGetPayload<{ include: typeof saleInclude }>) {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind as SaleKind,
    status: row.status,
    businessDate: row.businessDate,
    customerId: row.customerId,
    customerName: row.customerName,
    plate: row.plate,
    vehicle: row.vehicle,
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
    relatedSaleId: row.relatedSaleId,
    createdAt: row.createdAt,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: num(item.quantity),
      returnedQty: num(item.returnedQty),
      unitPrice: num(item.unitPrice),
      unitCost: num(item.unitCost),
      discount: num(item.discount),
      amount: num(item.amount),
      profit: num(item.profit),
    })),
  };
}

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money, num } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

const sessionInclude = {
  register: { include: { branch: true } },
  user: true,
} satisfies Prisma.CashSessionInclude;

@Injectable()
export class CashService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async current(userId: number) {
    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      include: sessionInclude,
    });
    if (!session) return null;
    return this.withTotals(session);
  }

  async requireOpen(userId: number) {
    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      include: { register: true },
    });
    if (!session) throw new BadRequestException('Abra la caja antes de cobrar');
    return session;
  }

  async open(user: AuthUser, registerId: number, openingAmount: number) {
    const amount = money(Number(openingAmount) || 0);
    if (amount < 0) throw new BadRequestException('El fondo de apertura no puede ser negativo');
    const existing = await this.prisma.cashSession.findFirst({ where: { userId: user.sub, status: 'OPEN' } });
    if (existing) throw new BadRequestException('Ya tiene una caja abierta');
    const register = await this.prisma.register.findUnique({ where: { id: registerId }, include: { branch: true } });
    if (!register || !register.active) throw new BadRequestException('La caja no está disponible');
    if (user.role !== 'ADMIN' && user.branchId && register.branchId !== user.branchId) {
      throw new BadRequestException('Esa caja pertenece a otra sucursal');
    }
    const busy = await this.prisma.cashSession.findFirst({ where: { registerId, status: 'OPEN' } });
    if (busy) throw new BadRequestException('Esa caja ya está abierta por otro usuario');
    const session = await this.prisma.cashSession.create({
      data: { registerId, userId: user.sub, openingAmount: amount },
      include: sessionInclude,
    });
    return this.withTotals(session);
  }

  async close(userId: number, countedAmount: number, notes?: string) {
    const session = await this.prisma.cashSession.findFirst({ where: { userId, status: 'OPEN' }, include: sessionInclude });
    if (!session) throw new BadRequestException('No hay una caja abierta');
    const totals = await this.totals(session.id, num(session.openingAmount));
    const counted = money(Number(countedAmount) || 0);
    const difference = money(counted - totals.expected);
    const closed = await this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        countedAmount: counted,
        expectedAmount: totals.expected,
        difference,
        notes: notes?.trim() || null,
      },
      include: sessionInclude,
    });
    return { ...this.present(closed), ...totals, counted, difference, status: 'CLOSED' as const };
  }

  async history(query: { page?: string; pageSize?: string }) {
    const page = pageArgs(query);
    const where = { status: 'CLOSED' as const };
    const [rows, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where,
        include: sessionInclude,
        orderBy: { closedAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.cashSession.count({ where }),
    ]);
    const differences = rows.reduce((sum, row) => sum + num(row.difference), 0);
    return pageOf(
      rows.map((row) => ({
        ...this.present(row),
        expected: num(row.expectedAmount),
        counted: num(row.countedAmount),
        difference: num(row.difference),
      })),
      total,
      page.page,
      page.pageSize,
      { summary: { closed: total, difference: money(differences) } },
    );
  }

  private async withTotals(session: Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>) {
    const totals = await this.totals(session.id, num(session.openingAmount));
    return { ...this.present(session), ...totals };
  }

  private present(session: Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>) {
    return {
      id: session.id,
      status: session.status,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingAmount: num(session.openingAmount),
      notes: session.notes,
      registerId: session.registerId,
      registerName: session.register.name,
      branchId: session.register.branchId,
      branchName: session.register.branch.name,
      userId: session.userId,
      userName: session.user.name,
    };
  }

  private async totals(sessionId: number, opening: number) {
    const [sales, returns, orders, payroll] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { cashSessionId: sessionId, status: 'PAID', kind: 'SALE' },
        _sum: { cashAmount: true, cardAmount: true, transferAmount: true, total: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { cashSessionId: sessionId, status: 'PAID', kind: 'RETURN' },
        _sum: { cashAmount: true, cardAmount: true, transferAmount: true, total: true },
        _count: true,
      }),
      this.prisma.serviceOrder.aggregate({
        where: { cashSessionId: sessionId, status: 'PAID' },
        _sum: { cashAmount: true, cardAmount: true, transferAmount: true, total: true },
        _count: true,
      }),
      this.prisma.payrollPayment.aggregate({
        where: { cashSessionId: sessionId, method: 'CASH' },
        _sum: { amount: true },
      }),
    ]);
    const payrollCash = num(payroll._sum.amount);
    const cashIn = num(sales._sum.cashAmount) + num(orders._sum.cashAmount) - num(returns._sum.cashAmount);
    const card = num(sales._sum.cardAmount) + num(orders._sum.cardAmount) - num(returns._sum.cardAmount);
    const transfer = num(sales._sum.transferAmount) + num(orders._sum.transferAmount) - num(returns._sum.transferAmount);
    const sold = num(sales._sum.total) + num(orders._sum.total) - num(returns._sum.total);
    return {
      cashIn: money(cashIn),
      payroll: money(payrollCash),
      card: money(card),
      transfer: money(transfer),
      sold: money(sold),
      expected: money(opening + cashIn - payrollCash),
      documents: sales._count + orders._count + returns._count,
    };
  }
}

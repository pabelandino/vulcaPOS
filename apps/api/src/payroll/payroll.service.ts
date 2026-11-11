import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PayKind, PaymentMethod, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { businessToday, parseYmd, ymd } from '../common/dates';
import { money, num } from '../common/money';
import { pageArgs, pageOf } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';

const KINDS: PayKind[] = ['SALARY', 'ADVANCE', 'COMMISSION', 'BONUS'];
const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER'];

@Injectable()
export class PayrollService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: { page?: string; pageSize?: string; from?: string; to?: string }) {
    const page = pageArgs(query);
    const end = parseYmd(query.to) || businessToday();
    const start = parseYmd(query.from) || end;
    const where = { paidAt: { gte: start, lte: end } };
    const [rows, total, sums] = await Promise.all([
      this.prisma.payrollPayment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
        include: { user: true, paidBy: true, cashSession: true },
      }),
      this.prisma.payrollPayment.count({ where }),
      this.prisma.payrollPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    const pageSubtotal = money(rows.reduce((sum, row) => sum + num(row.amount), 0));
    return pageOf(rows.map(present), total, page.page, page.pageSize, {
      summary: { total: num(sums._sum.amount) },
      pageSubtotal,
    });
  }

  async create(actor: AuthUser, body: { userId?: number; amount?: number; paidAt?: string; periodFrom?: string; periodTo?: string; kind?: string; method?: string; notes?: string }) {
    const amount = money(Number(body.amount) || 0);
    if (amount <= 0) throw new BadRequestException('El monto debe ser mayor que cero');
    const userId = Number(body.userId);
    const worker = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!worker) throw new BadRequestException('Elija un trabajador');
    const paidAt = parseYmd(body.paidAt) || businessToday();
    const periodFrom = parseYmd(body.periodFrom) || paidAt;
    const periodTo = parseYmd(body.periodTo) || paidAt;
    if (periodFrom > periodTo) throw new BadRequestException('La fecha inicial del período no puede ser mayor que la final');
    const kind = KINDS.includes(body.kind as PayKind) ? (body.kind as PayKind) : 'SALARY';
    const method = METHODS.includes(body.method as PaymentMethod) ? (body.method as PaymentMethod) : 'CASH';
    let cashSessionId: number | null = null;
    if (method === 'CASH') {
      const session = await this.prisma.cashSession.findFirst({ where: { userId: actor.sub, status: 'OPEN' } });
      cashSessionId = session?.id ?? null;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payrollPayment.create({
        data: {
          userId,
          paidById: actor.sub,
          paidAt,
          periodFrom,
          periodTo,
          kind,
          method,
          amount,
          notes: body.notes?.trim() || null,
          cashSessionId,
        },
      });
      if (kind === 'COMMISSION') {
        await tx.serviceOrderLine.updateMany({
          where: {
            kind: 'SERVICE',
            payrollPaymentId: null,
            order: { status: 'PAID', cashierId: userId },
            service: { workerAmount: { gt: 0 } },
          },
          data: { payrollPaymentId: payment.id },
        });
      }
      return tx.payrollPayment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { user: true, paidBy: true, cashSession: true },
      });
    });
    return present(created);
  }

  async due(userId?: string) {
    const id = Number(userId);
    const lines = await this.prisma.serviceOrderLine.findMany({
      where: {
        kind: 'SERVICE',
        payrollPaymentId: null,
        order: { status: 'PAID', cashierId: Number.isInteger(id) && id > 0 ? id : { not: null } },
        service: { workerAmount: { gt: 0 } },
      },
      select: {
        name: true,
        quantity: true,
        serviceId: true,
        order: { select: { cashierId: true } },
        service: { select: { name: true, workerAmount: true } },
      },
    });
    const byUser = new Map<number, Map<string, DueService & { lineCount: number }>>();
    for (const line of lines) {
      const workerId = line.order.cashierId;
      if (workerId == null || !line.service) continue;
      const rate = num(line.service.workerAmount);
      const commission = money(num(line.quantity) * rate);
      const name = line.service.name || line.name;
      const key = `${line.serviceId ?? name}:${rate}`;
      const groups = byUser.get(workerId) ?? new Map<string, DueService & { lineCount: number }>();
      const current = groups.get(key) ?? { name, quantity: 0, rate, commission: 0, lineCount: 0 };
      current.quantity = money(current.quantity + num(line.quantity));
      current.commission = money(current.commission + commission);
      current.lineCount += 1;
      groups.set(key, current);
      byUser.set(workerId, groups);
    }
    return {
      items: [...byUser.entries()].map(([worker, groups]) => {
        const services = [...groups.values()].sort((left, right) => right.commission - left.commission || left.name.localeCompare(right.name));
        return {
          userId: worker,
          amount: money(services.reduce((sum, service) => sum + service.commission, 0)),
          lines: services.reduce((sum, service) => sum + service.lineCount, 0),
          services: services.map(({ lineCount, ...service }) => service),
        };
      }),
    };
  }

  async remove(id: number) {
    const row = await this.prisma.payrollPayment.findUnique({ where: { id }, include: { cashSession: true } });
    if (!row) throw new NotFoundException('Ese pago no existe');
    if (row.cashSession?.status === 'CLOSED') throw new BadRequestException('Ese pago ya quedó en una caja cerrada');
    await this.prisma.payrollPayment.delete({ where: { id } });
    return { ok: true };
  }
}

type DueService = {
  name: string;
  quantity: number;
  rate: number;
  commission: number;
};

function present(row: Prisma.PayrollPaymentGetPayload<{ include: { user: true; paidBy: true; cashSession: true } }>) {
  return {
    id: row.id,
    userId: row.userId,
    workerName: row.user.name,
    paidByName: row.paidBy.name,
    paidAt: ymd(row.paidAt),
    periodFrom: ymd(row.periodFrom),
    periodTo: ymd(row.periodTo),
    kind: row.kind,
    method: row.method,
    amount: num(row.amount),
    notes: row.notes,
    fromOpenCash: row.cashSession?.status === 'OPEN',
    locked: row.cashSession?.status === 'CLOSED',
  };
}

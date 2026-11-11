import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { sectionsFor } from '../auth/access';
import { pageArgs, pageOf } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: { page?: string; pageSize?: string; q?: string }) {
    const page = pageArgs(query);
    const term = query.q?.trim();
    const where = term
      ? { OR: [{ name: { contains: term, mode: 'insensitive' as const } }, { username: { contains: term, mode: 'insensitive' as const } }] }
      : {};
    const [rows, total, admins] = await Promise.all([
      this.prisma.user.findMany({ where, skip: page.skip, take: page.take, orderBy: { name: 'asc' }, include: { branch: true } }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { role: 'ADMIN', active: true } }),
    ]);
    return pageOf(rows.map(present), total, page.page, page.pageSize, { summary: { users: total, admins } });
  }

  async save(id: number | null, body: { username?: string; name?: string; password?: string; role?: Role; branchId?: number | null; active?: boolean; access?: string[] }) {
    const name = body.name?.trim();
    const username = body.username?.trim().toLowerCase();
    if (!name || !username) throw new BadRequestException('Nombre y usuario son obligatorios');
    if (body.role !== 'ADMIN' && body.role !== 'CASHIER') throw new BadRequestException('El rol no es válido');
    const access = sectionsFor(body.role, body.access || []);
    if (body.role !== 'ADMIN' && access.length === 0) throw new BadRequestException('Marque al menos una parte del sistema');
    const data = {
      name,
      username,
      role: body.role,
      access,
      branchId: body.branchId || null,
      active: body.active !== false,
    };
    if (id) {
      const current = await this.prisma.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Usuario no encontrado');
      const losesAdmin = current.role === 'ADMIN' && current.active && (body.role !== 'ADMIN' || body.active === false);
      if (losesAdmin) {
        const others = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
        if (others === 0) throw new BadRequestException('Debe quedar al menos un administrador activo');
      }
    }
    try {
      if (!id) {
        if (!body.password || body.password.length < 6) throw new BadRequestException('La clave debe tener al menos 6 caracteres');
        const created = await this.prisma.user.create({
          data: { ...data, passwordHash: await bcrypt.hash(body.password, 10) },
          include: { branch: true },
        });
        return present(created);
      }
      const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;
      if (body.password && body.password.length < 6) throw new BadRequestException('La clave debe tener al menos 6 caracteres');
      const updated = await this.prisma.user.update({
        where: { id },
        data: { ...data, ...(passwordHash ? { passwordHash } : {}) },
        include: { branch: true },
      });
      return present(updated);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Ese usuario ya existe');
    }
  }

  async changeOwnPassword(userId: number, currentPassword: string, nextPassword: string) {
    if (!nextPassword || nextPassword.length < 6) throw new BadRequestException('La clave nueva debe tener al menos 6 caracteres');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!(await bcrypt.compare(currentPassword || '', user.passwordHash))) {
      throw new BadRequestException('La clave actual no coincide');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(nextPassword, 10) } });
    return { ok: true };
  }
}

function present(user: { id: number; username: string; name: string; role: Role; active: boolean; access?: string[]; branchId: number | null; branch?: { name: string } | null }) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    access: sectionsFor(user.role, user.access || []),
    branchId: user.branchId,
    branchName: user.branch?.name || null,
  };
}

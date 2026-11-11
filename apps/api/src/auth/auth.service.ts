import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { sectionsFor } from './access';
import { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username.trim(), mode: 'insensitive' } },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    if (!user.active) throw new UnauthorizedException('Este usuario está deshabilitado');
    const payload = this.present(user);
    return {
      token: await this.jwt.signAsync(payload),
      user: payload,
    };
  }

  async profile(userId: number): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException('Este usuario está deshabilitado');
    return this.present(user);
  }

  private present(user: { id: number; username: string; name: string; role: 'ADMIN' | 'CASHIER'; branchId: number | null; access: string[] }): AuthUser {
    return {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      access: sectionsFor(user.role, user.access),
    };
  }
}

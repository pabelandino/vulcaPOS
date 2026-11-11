import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { Section } from './access';
import { AuthUser } from './auth.types';

export const ROLES_KEY = 'roles';
export const ACCESS_KEY = 'access';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly reflector = new Reflector();

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Array<AuthUser['role']>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return !!user && roles.includes(user.role);
  }
}

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly reflector = new Reflector();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<Section[]>(ACCESS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) return false;
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { role: true, active: true, access: true },
    });
    if (!row?.active) throw new ForbiddenException('Este usuario está deshabilitado');
    if (row.role === 'ADMIN') return true;
    if (required.some((section) => row.access.includes(section))) return true;
    throw new ForbiddenException('No tiene acceso a esta parte del sistema');
  }
}

export function Auth(...roles: Array<AuthUser['role']>) {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), SetMetadata(ROLES_KEY, roles));
}

export function Access(...sections: Section[]) {
  return applyDecorators(UseGuards(JwtAuthGuard, AccessGuard), SetMetadata(ACCESS_KEY, sections));
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});

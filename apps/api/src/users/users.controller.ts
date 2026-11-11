import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Access, Auth, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @Access('usuarios')
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.users.list({ page, pageSize, q });
  }

  @Post()
  @Access('usuarios')
  create(@Body() body: { username?: string; name?: string; password?: string; role?: Role; branchId?: number | null; active?: boolean; access?: string[] }) {
    return this.users.save(null, body);
  }

  @Patch(':id')
  @Access('usuarios')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { username?: string; name?: string; password?: string; role?: Role; branchId?: number | null; active?: boolean; access?: string[] },
  ) {
    return this.users.save(id, body);
  }

  @Post('me/password')
  @Auth()
  password(@CurrentUser() user: AuthUser, @Body() body: { currentPassword?: string; nextPassword?: string }) {
    return this.users.changeOwnPassword(user.sub, body.currentPassword || '', body.nextPassword || '');
  }
}

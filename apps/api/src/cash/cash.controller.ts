import { Body, Controller, Get, Inject, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { CashService } from './cash.service';

@Controller('cash')
export class CashController {
  constructor(@Inject(CashService) private readonly cash: CashService) {}

  @Get('current')
  @Access('caja', 'ventas')
  async current(@CurrentUser() user: AuthUser, @Res() response: Response) {
    response.json(await this.cash.current(user.sub));
  }

  @Get('history')
  @Access('caja')
  history(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.cash.history({ page, pageSize });
  }

  @Post('open')
  @Access('caja')
  open(@CurrentUser() user: AuthUser, @Body() body: { registerId?: number; openingAmount?: number }) {
    return this.cash.open(user, Number(body.registerId), Number(body.openingAmount));
  }

  @Post('close')
  @Access('caja')
  close(@CurrentUser() user: AuthUser, @Body() body: { countedAmount?: number; notes?: string }) {
    return this.cash.close(user.sub, Number(body.countedAmount), body.notes);
  }
}

import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { Access, Auth, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { PayInput, SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(@Inject(SalesService) private readonly sales: SalesService) {}

  @Get()
  @Access('ventas', 'reportes')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('kind') kind?: string,
  ) {
    return this.sales.list({ page, pageSize, q, from, to, kind });
  }

  @Get(':id')
  @Access('ventas', 'reportes')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.sales.get(id);
  }

  @Post()
  @Access('ventas')
  create(@CurrentUser() user: AuthUser, @Body() body: PayInput) {
    return this.sales.create(user, body);
  }

  @Post(':id/return')
  @Access('ventas', 'reportes')
  returnSale(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { lines?: { saleItemId?: number; quantity?: number }[]; paymentMethod?: PaymentMethod; cashAmount?: number; cardAmount?: number; transferAmount?: number },
  ) {
    return this.sales.returnSale(user, id, body);
  }

  @Post(':id/void')
  @Auth('ADMIN')
  voidSale(@Param('id', ParseIntPipe) id: number) {
    return this.sales.voidSale(id);
  }
}

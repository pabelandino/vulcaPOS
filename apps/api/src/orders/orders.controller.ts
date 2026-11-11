import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Access, Auth, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { OrderInput, OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  @Access('ordenes', 'reportes')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.orders.list({ page, pageSize, q, from, to, status });
  }

  @Get(':id')
  @Access('ordenes', 'ventas')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.orders.get(id);
  }

  @Post()
  @Access('ordenes', 'ventas')
  create(@CurrentUser() user: AuthUser, @Body() body: OrderInput) {
    return this.orders.create(user, body);
  }

  @Patch(':id')
  @Access('ordenes', 'ventas')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: OrderInput) {
    return this.orders.update(user, id, body);
  }

  @Post(':id/pay')
  @Access('ordenes', 'ventas')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: OrderInput) {
    return this.orders.pay(user, id, body);
  }

  @Post(':id/void')
  @Auth('ADMIN')
  voidOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orders.voidOrder(id);
  }
}

import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { Access, CurrentUser } from '../auth/guards';
import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly payroll: PayrollService) {}

  @Get()
  @Access('planilla')
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.payroll.list({ page, pageSize, from, to });
  }

  @Get('due')
  @Access('planilla')
  due(@Query('userId') userId?: string) {
    return this.payroll.due(userId);
  }

  @Post()
  @Access('planilla')
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { userId?: number; amount?: number; paidAt?: string; periodFrom?: string; periodTo?: string; kind?: string; method?: string; notes?: string },
  ) {
    return this.payroll.create(user, body);
  }

  @Delete(':id')
  @Access('planilla')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.remove(id);
  }
}

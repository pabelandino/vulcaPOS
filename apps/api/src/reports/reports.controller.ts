import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('summary')
  @Access('reportes')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(from, to);
  }

  @Get('sales')
  @Access('reportes')
  sales(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.reports.sales({ page, pageSize, from, to, q });
  }

  @Get('orders')
  @Access('reportes')
  orders(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.reports.orders({ page, pageSize, from, to, q });
  }

  @Get('sold')
  @Access('reportes')
  sold(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('productPage') productPage?: string,
    @Query('servicePage') servicePage?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reports.sold({ from, to, productPage, servicePage, pageSize });
  }

  @Get('workers')
  @Access('reportes', 'planilla')
  workers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.workers(from, to);
  }

  @Get('low-stock')
  @Access('reportes')
  lowStock(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.reports.lowStock({ page, pageSize, q });
  }

  @Get('dashboard')
  @Access('panel')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('export')
  @Access('reportes')
  async excel(
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tab') tab?: string,
    @Query('q') q?: string,
  ) {
    const file = await this.reports.excel({ from, to, tab, q, admin: user.role === 'ADMIN' });
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(file.buffer);
  }
}

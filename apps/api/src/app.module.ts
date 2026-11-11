import { networkInterfaces } from 'node:os';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CashModule } from './cash/cash.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { PayrollModule } from './payroll/payroll.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { Controller, Get } from '@nestjs/common';

function networkRank(name: string) {
  return /bridge|docker|utun|awdl|llw|vmnet|veth/i.test(name) ? 1 : 0;
}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true, app: 'vulcapos' };
  }
}

@Controller('network')
class NetworkController {
  @Get()
  list() {
    const addresses: Array<{ name: string; address: string }> = [];
    for (const [name, entries] of Object.entries(networkInterfaces())) {
      for (const entry of entries || []) {
        const family = String(entry.family);
        if ((family === 'IPv4' || family === '4') && !entry.internal) addresses.push({ name, address: entry.address });
      }
    }
    addresses.sort((left, right) => networkRank(left.name) - networkRank(right.name));
    return { addresses };
  }
}

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, SettingsModule, CatalogModule, CashModule, SalesModule, OrdersModule, ReportsModule, PayrollModule],
  controllers: [HealthController, NetworkController],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { CashModule } from '../cash/cash.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CashModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

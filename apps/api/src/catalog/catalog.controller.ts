import { Body, Controller, Get, Inject, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Access, Auth, CurrentUser } from '../auth/guards';
import { AuthUser } from '../auth/auth.types';
import { CatalogService } from './catalog.service';

type Body = Record<string, any>;

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('products/top')
  @Access('ventas', 'productos')
  topProducts() {
    return this.catalog.topSellers(10);
  }

  @Get('products')
  @Access('ventas', 'ordenes', 'productos', 'inventario', 'ingresos')
  products(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('all') all?: string,
    @Query('maxStock') maxStock?: string,
    @Query('low') low?: string,
  ) {
    return this.catalog.products({ page, pageSize, q, all, maxStock, low });
  }

  @Post('products')
  @Access('productos', 'ingresos')
  createProduct(@Body() body: Body) {
    return this.catalog.saveProduct(null, body);
  }

  @Patch('products/:id')
  @Access('productos')
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() body: Body) {
    return this.catalog.saveProduct(id, body);
  }

  @Post('products/:id/stock')
  @Access('inventario')
  adjust(@Param('id', ParseIntPipe) id: number, @Body() body: { stock?: number; reason?: string }) {
    return this.catalog.adjustStock(id, Number(body.stock), body.reason || 'Ajuste');
  }

  @Get('services')
  @Access('ventas', 'ordenes', 'servicios')
  services(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string, @Query('all') all?: string) {
    return this.catalog.services({ page, pageSize, q, all });
  }

  @Post('services')
  @Access('servicios')
  createService(@Body() body: Body) {
    return this.catalog.saveService(null, body);
  }

  @Patch('services/:id')
  @Access('servicios')
  updateService(@Param('id', ParseIntPipe) id: number, @Body() body: Body) {
    return this.catalog.saveService(id, body);
  }

  @Get('customers')
  @Access('clientes', 'ventas', 'ordenes')
  customers(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.catalog.customers({ page, pageSize, q });
  }

  @Post('customers')
  @Access('clientes', 'ventas', 'ordenes')
  createCustomer(@Body() body: Body) {
    return this.catalog.saveCustomer(null, body);
  }

  @Patch('customers/:id')
  @Access('clientes', 'ventas', 'ordenes')
  updateCustomer(@Param('id', ParseIntPipe) id: number, @Body() body: Body) {
    return this.catalog.saveCustomer(id, body);
  }

  @Get('suppliers')
  @Access('proveedores', 'ingresos', 'productos')
  suppliers(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('q') q?: string) {
    return this.catalog.suppliers({ page, pageSize, q });
  }

  @Post('suppliers')
  @Access('proveedores')
  createSupplier(@Body() body: Body) {
    return this.catalog.saveSupplier(null, body);
  }

  @Patch('suppliers/:id')
  @Access('proveedores')
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() body: Body) {
    return this.catalog.saveSupplier(id, body);
  }

  @Get('branches')
  @Auth()
  branches() {
    return this.catalog.branches();
  }

  @Post('branches')
  @Auth('ADMIN')
  createBranch(@Body() body: { name?: string; address?: string; phone?: string; active?: boolean }) {
    return this.catalog.saveBranch(null, body);
  }

  @Patch('branches/:id')
  @Auth('ADMIN')
  updateBranch(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; address?: string; phone?: string; active?: boolean }) {
    return this.catalog.saveBranch(id, body);
  }

  @Post('registers')
  @Auth('ADMIN')
  createRegister(@Body() body: { branchId?: number; name?: string; active?: boolean }) {
    return this.catalog.saveRegister(null, body);
  }

  @Patch('registers/:id')
  @Auth('ADMIN')
  updateRegister(@Param('id', ParseIntPipe) id: number, @Body() body: { branchId?: number; name?: string; active?: boolean }) {
    return this.catalog.saveRegister(id, body);
  }

  @Get('inventory/moves')
  @Access('inventario')
  moves(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.catalog.movements({ page, pageSize });
  }

  @Get('receipts')
  @Access('ingresos')
  receipts(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.catalog.receipts({ page, pageSize });
  }

  @Post('receipts')
  @Access('ingresos')
  createReceipt(@CurrentUser() user: AuthUser, @Body() body: Body) {
    return this.catalog.createReceipt(user.sub, body);
  }
}

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { num } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { createBackup } from './backup';

export type CompanyInput = {
  name?: string;
  tradeName?: string;
  ruc?: string;
  address?: string;
  phone?: string;
  email?: string;
  city?: string;
  voucherTitle?: string;
  headerLine?: string;
  voucherFooter?: string;
  warrantyNote?: string;
  taxRate?: number;
  pricesIncludeTax?: boolean;
  currency?: string;
  ticketWidth?: number;
};

@Injectable()
export class SettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get() {
    const company = await this.prisma.company.findFirst();
    if (!company) return null;
    return {
      ...company,
      taxRate: num(company.taxRate),
    };
  }

  async update(input: CompanyInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('El nombre de la empresa es obligatorio');
    const taxRate = Number(input.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new BadRequestException('El impuesto debe estar entre 0 y 100');
    }
    const data = {
      name,
      tradeName: clean(input.tradeName),
      ruc: clean(input.ruc),
      address: clean(input.address),
      phone: clean(input.phone),
      email: clean(input.email),
      city: clean(input.city),
      voucherTitle: input.voucherTitle?.trim() || 'BOUCHER',
      headerLine: clean(input.headerLine),
      voucherFooter: clean(input.voucherFooter),
      warrantyNote: clean(input.warrantyNote),
      taxRate,
      pricesIncludeTax: input.pricesIncludeTax !== false,
      currency: input.currency?.trim() || 'C$',
      ticketWidth: input.ticketWidth === 58 ? 58 : 80,
    };
    const current = await this.prisma.company.findFirst();
    const saved = current
      ? await this.prisma.company.update({ where: { id: current.id }, data })
      : await this.prisma.company.create({ data });
    return { ...saved, taxRate: num(saved.taxRate) };
  }

  async backup() {
    try {
      return await createBackup();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar el respaldo';
      throw new BadRequestException(message);
    }
  }
}

function clean(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

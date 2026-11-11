import { Body, Controller, Get, Inject, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, Auth } from '../auth/guards';
import { CompanyInput, SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  @Auth()
  get() {
    return this.settings.get();
  }

  @Patch()
  @Access('ajustes')
  update(@Body() body: CompanyInput) {
    return this.settings.update(body);
  }

  @Post('backup')
  @Access('ajustes')
  async backup(@Res() res: Response) {
    const file = await this.settings.backup();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }
}

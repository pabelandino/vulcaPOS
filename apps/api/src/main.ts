import './timezone';
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import dotenv from 'dotenv';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http';
import { ensureDemo } from './seed';
import { attachSpa } from './spa';

function loadEnv() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) dotenv.config({ path: file });
  }
}

async function bootstrap() {
  loadEnv();
  await ensureDemo();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 3010);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.set('etag', false);
  attachSpa(app);
  await app.listen(port, host);
  console.log(`VulcaPOS listening on http://${host}:${port}`);
}

bootstrap();

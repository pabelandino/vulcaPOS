import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { stampFile } from '../common/dates';

// Plain SQL that drops and recreates the database, then loads schema and every row.
const dumpFlags = [
  '--format=plain',
  '--encoding=UTF8',
  '--clean',
  '--if-exists',
  '--create',
  '--blobs',
  '--no-owner',
  '--no-acl',
];

export async function createBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no está configurada');
  const user = process.env.POSTGRES_USER || 'vulcapos';
  const db = process.env.POSTGRES_DB || 'vulcapos';
  const container = process.env.POSTGRES_CONTAINER || 'vulcapos-postgres';
  const attempts: Array<{ command: string; args: string[] }> = [
    { command: 'pg_dump', args: ['--dbname', databaseUrl, ...dumpFlags] },
    { command: 'docker', args: ['exec', container, 'pg_dump', '-U', user, '-d', db, ...dumpFlags] },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const buffer = await runDump(attempt.command, attempt.args);
      const name = `respaldo_${stampFile()}.sql.gz`;
      const dir = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, name), buffer);
      } catch (error) {
        console.warn('No se pudo guardar la copia local del respaldo', error);
      }
      return { name, buffer };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`No se pudo generar el respaldo. ${errors.join(' ')}`);
}

function runDump(command: string, args: string[]) {
  const child = spawn(command, args, { env: { ...process.env, PGCONNECT_TIMEOUT: '15' } });
  const chunks: Buffer[] = [];
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  const dumped = pipeline(child.stdout, createGzip(), sink).catch((error: Error) => error);
  const closed = new Promise<number>((resolve, reject) => {
    child.once('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`${command} no está instalado`));
        return;
      }
      reject(error);
    });
    child.once('close', (code) => resolve(code ?? 1));
  });
  return Promise.all([closed, dumped]).then(([code, pipelineResult]) => {
    if (pipelineResult instanceof Error) throw pipelineResult;
    if (code !== 0) throw new Error(stderr.trim() || `${command} terminó con código ${code}`);
    const buffer = Buffer.concat(chunks);
    if (buffer.length < 100) throw new Error('El respaldo quedó vacío');
    return buffer;
  });
}

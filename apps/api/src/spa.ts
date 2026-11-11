import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';

function resolveWebDist() {
  const candidates = [process.env.WEB_DIST, join(process.cwd(), 'apps/web/dist'), join(__dirname, '../../web/dist')];
  return candidates.find((dir) => dir && existsSync(join(dir, 'index.html')));
}

export function attachSpa(app: NestExpressApplication) {
  const webDist = resolveWebDist();
  if (!webDist) {
    console.log('SPA skipped: apps/web/dist not found');
    return;
  }
  app.useStaticAssets(webDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
  app.use((req: { path: string; method: string }, res: { sendFile: (file: string) => void }, next: () => void) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (extname(req.path)) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

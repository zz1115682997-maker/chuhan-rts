// Minimal static file server: serves the project root plus a /vendor route for
// pixi so index.html can resolve the bare "pixi.js" specifier via an import map.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT || 5273);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const VENDOR = {
  '/vendor/pixi.mjs': join(ROOT, 'node_modules/pixi.js/dist/pixi.mjs'),
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    let filePath;
    if (VENDOR[pathname]) {
      filePath = VENDOR[pathname];
    } else {
      filePath = resolve(join(ROOT, pathname));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': info.size,
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`楚汉 RTS  →  http://${HOST}:${PORT}/`);
});

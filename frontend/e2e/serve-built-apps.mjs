import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
for (const [directory, port] of [['dist/nexttrade-angular/browser', 18080], ['../insights-frontend/dist/insights-frontend/browser', 18081]]) {
  const root = resolve(directory);
  createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      if (path.startsWith('/api/') || path.startsWith('/auth/')) { response.writeHead(404).end(); return; }
      let file = resolve(root, '.' + path);
      if (!file.startsWith(root + sep) && file !== root) { response.writeHead(404).end(); return; }
      const exists = await stat(file).catch(() => null);
      if (!exists?.isFile()) file = resolve(root, 'index.html');
      response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  }).listen(port, '127.0.0.1');
}

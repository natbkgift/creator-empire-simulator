import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), value('--root', 'dist'));
const port = Number(value('--port', '4173'));
const host = value('--host', '127.0.0.1');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.md':'text/markdown; charset=utf-8'};
const safePath = requestPath => {
  const clean = decodeURIComponent(requestPath.split('?')[0]).replace(/^\/+/, '');
  const candidate = path.resolve(root, clean || 'index.html');
  return candidate.startsWith(root) ? candidate : path.join(root, 'index.html');
};
const server = http.createServer(async (req, res) => {
  try {
    let file = safePath(req.url || '/');
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch {}
    let body;
    try { body = await readFile(file); } catch { file = path.join(root, 'index.html'); body = await readFile(file); }
    res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream','cache-control':'no-cache'});
    res.end(body);
  } catch (error) {
    res.writeHead(500, {'content-type':'text/plain; charset=utf-8'});
    res.end(error instanceof Error ? error.message : 'Server error');
  }
});
server.listen(port, host, () => console.log(`Creator Empire Simulator: http://${host}:${port}`));

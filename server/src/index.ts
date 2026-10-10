import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_PORT } from '@spidi/shared';
import { Leaderboard } from './leaderboard';
import { Room } from './room';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(process.cwd(), 'client/dist'));
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const leaderboard = new Leaderboard(join(DATA_DIR, 'leaderboard.json'));

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
}

/** GET /api/leaderboard[?track=id] – POST /api/leaderboard { entries: LeaderboardSubmission[] } */
function leaderboardApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method === 'GET') {
    const track = url.searchParams.get('track');
    json(res, 200, { entries: track ? leaderboard.forTrack(track) : leaderboard.all() });
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method not allowed' });
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 16 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const entries = Array.isArray(data.entries) ? data.entries.slice(0, 2) : [];
      json(res, 200, { ranks: leaderboard.add(entries) });
    } catch {
      json(res, 400, { error: 'invalid json' });
    }
  });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/leaderboard') {
    leaderboardApi(req, res, url);
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  let file = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Client nicht gebaut – bitte "npm run build" ausführen oder im Dev-Modus Port 5173 verwenden.');
    return;
  }
  const ext = extname(file);
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const room = new Room(leaderboard);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => room.add(ws));
});

server.listen(PORT, () => {
  console.log(`Spidi Race Server läuft auf Port ${PORT}`);
  if (process.env.IN_DOCKER) {
    console.log('  im LAN: http://<IP-dieses-Rechners>:<veröffentlichter Port>');
    return;
  }
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  im LAN: http://${i.address}:${PORT}`);
});

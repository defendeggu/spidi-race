import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { createGzip } from 'node:zlib';
import { WebSocketServer } from 'ws';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Leaderboard } from './leaderboard';
import { Room } from './room';

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
/** text formats worth compressing (models and images are already compact) */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.md']);

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};

/** POSTs to the leaderboard per IP and minute. */
const POSTS_PER_MINUTE = 10;

export interface AppOptions {
  staticDir: string;
  dataDir: string;
}

/** HTTP server (static client, leaderboard API) with the WebSocket lobby attached; not yet listening. */
export function createApp({ staticDir, dataDir }: AppOptions) {
  const leaderboard = new Leaderboard(join(dataDir, 'leaderboard.json'));
  const room = new Room(leaderboard);
  const posts = new Map<string, { count: number; reset: number }>();

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  }

  function rateLimited(req: IncomingMessage) {
    const ip = req.socket.remoteAddress ?? '?';
    const now = Date.now();
    let e = posts.get(ip);
    if (!e || e.reset < now) {
      e = { count: 0, reset: now + 60_000 };
      posts.set(ip, e);
      // forget old addresses now and then
      if (posts.size > 1000) for (const [k, v] of posts) if (v.reset < now) posts.delete(k);
    }
    return ++e.count > POSTS_PER_MINUTE;
  }

  /** GET /api/leaderboard[?track=id] – POST /api/leaderboard { entries: LeaderboardSubmission[] } */
  function leaderboardApi(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (req.method === 'GET') {
      const track = url.searchParams.get('track');
      json(res, 200, { entries: track ? leaderboard.forTrack(track) : leaderboard.top() });
      return;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: 'method not allowed' });
      return;
    }
    if (rateLimited(req)) {
      json(res, 429, { error: 'too many requests' });
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
        const entries = Array.isArray(data?.entries) ? data.entries.slice(0, 2) : [];
        json(res, 200, { ranks: leaderboard.add(entries) });
      } catch {
        json(res, 400, { error: 'invalid json' });
      }
    });
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    let file = normalize(join(staticDir, pathname));
    // the resolved file must stay inside the static folder (no sibling folders with the same prefix)
    const rel = relative(staticDir, file);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403, SECURITY_HEADERS).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' })
        .end('Client nicht gebaut – bitte "npm run build" ausführen oder im Dev-Modus Port 5173 verwenden.');
      return;
    }
    const st = statSync(file);
    const ext = extname(file);
    const gzip = COMPRESSIBLE.has(ext) && st.size > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${gzip ? '-gz' : ''}"`;
    const headers: Record<string, string> = {
      ...SECURITY_HEADERS,
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      etag,
      'last-modified': st.mtime.toUTCString(),
      vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    if (gzip) headers['content-encoding'] = 'gzip';
    else headers['content-length'] = String(st.size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
  }

  const server = createServer((req, res) => {
    let url: URL, pathname: string;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }
    if (url.pathname === '/api/leaderboard') {
      leaderboardApi(req, res, url);
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    serveStatic(req, res, pathname);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    // only pages served by this server may connect (no foreign web page in a player's browser)
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (host !== req.headers.host) {
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => room.add(ws));
  });

  return { server, room, leaderboard, wss };
}

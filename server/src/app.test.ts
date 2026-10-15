import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from './app';

let base = '';
let port = 0;
let root = '';
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'spidi-app-'));
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Spidi</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("spidi");\n'.repeat(200));
  // a sibling folder whose name starts like the static folder (security report S-5)
  mkdirSync(join(root, 'dist-secret'));
  writeFileSync(join(root, 'dist-secret', 'secret.txt'), 'geheim');
  app = createApp({ staticDir: dist, dataDir: join(root, 'data') });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  port = (app.server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  app.room.close();
  app.wss.close();
  await new Promise((r) => app.server.close(r));
  rmSync(root, { recursive: true, force: true });
});

/** Raw request (fetch would normalise the paths we want to send). */
function raw(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('http server', () => {
  it('answers malformed URLs with 400 instead of crashing (S-1)', async () => {
    expect((await raw('/%E0%A4%A')).status).toBe(400);
    expect((await raw('//')).status).toBe(400);
    expect((await raw('/health')).status).toBe(200);
  });

  it('never serves files outside the static folder (S-5)', async () => {
    const r = await raw('/..%2fdist-secret/secret.txt');
    expect(r.status).toBe(403);
    expect(r.body.toString()).not.toContain('geheim');
  });

  it('compresses text, sends ETags and 304s, and security headers (F-2, S-9)', async () => {
    const r = await raw('/assets/app.js', { 'accept-encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(r.body).toString()).toContain('spidi');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    const again = await raw('/assets/app.js', { 'accept-encoding': 'gzip', 'if-none-match': String(r.headers.etag) });
    expect(again.status).toBe(304);
    const plain = await raw('/assets/app.js');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.headers.etag).not.toBe(r.headers.etag);
  });

  it('does not accept online races or floods over HTTP (S-2, S-6)', async () => {
    const post = (entries: unknown[]) => fetch(`${base}/api/leaderboard`, { method: 'POST', body: JSON.stringify({ entries }) });
    const fake = { name: 'Fake', carId: 'falcone', trackId: 'alpenpass', laps: 2, time: 100, bestLap: 45, mode: 'online' };
    expect(await (await post([fake])).json()).toEqual({ ranks: [0] });
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await post([{ ...fake, mode: 'solo' }])).status;
    expect(last).toBe(429);
  });
});

describe('websocket', () => {
  const connect = (origin?: string) =>
    new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin } : {});
      ws.on('message', (d) => {
        resolve(JSON.parse(String(d)).type);
        ws.close();
      });
      ws.on('error', () => resolve('rejected'));
    });

  it('rejects connections from foreign web pages (S-4)', async () => {
    expect(await connect('http://evil.example')).toBe('rejected');
    expect(await connect(`http://127.0.0.1:${port}`)).toBe('welcome');
    // tools without an Origin header (no browser) are fine
    expect(await connect()).toBe('welcome');
  });
});

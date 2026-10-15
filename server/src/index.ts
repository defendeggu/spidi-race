import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_PORT } from '@spidi/shared';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const { server, leaderboard } = createApp({
  staticDir: resolve(process.env.STATIC_DIR ?? join(process.cwd(), 'client/dist')),
  dataDir: resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data')),
});

// pending leaderboard changes must not get lost when the container stops
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    leaderboard.flushSync();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`Spidi Race Server läuft auf Port ${PORT}`);
  if (process.env.IN_DOCKER) {
    console.log('  im LAN: http://<IP-dieses-Rechners>:<veröffentlichter Port>');
    return;
  }
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  im LAN: http://${i.address}:${PORT}`);
});

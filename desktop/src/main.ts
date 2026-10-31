import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import type { Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PORT } from '@spidi/shared';
import { createApp } from '../../server/src/app';

/**
 * Spidi Race as a Windows app: starts the game server inside the app (the same code as the Docker
 * container) and shows the game in its own window. Other players in the home network open the
 * address shown in the lobby in their browser, or start the app themselves.
 */

// the engine starts at once and the sounds play without a click first
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// a second start brings the running window to the front instead of starting a second server
if (!app.requestSingleInstanceLock()) app.quit();

/** game files: next to the app when installed, the Vite build of the repo during development */
const staticDir = app.isPackaged ? join(process.resourcesPath, 'client') : join(__dirname, '../../client/dist');

let win: BrowserWindow | null = null;
let lanHost: string | null = null;

/** First IPv4 address in the home network (for the lobby hint), or null without a network. */
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}

/** Listen on the usual port; if it is taken (e.g. by the Docker container), on a free one. */
function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EADDRINUSE') return reject(err);
      server.listen(0, '0.0.0.0');
    };
    server.on('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT);
    });
    server.listen(DEFAULT_PORT, '0.0.0.0');
  });
}

function createWindow(port: number) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'Spidi Race',
    backgroundColor: '#101820',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // stable origin (127.0.0.1) so names and settings in the browser storage survive a new IP address
  const origin = `http://127.0.0.1:${port}`;
  win.loadURL(origin);
  // links (credits, GitHub) open in the normal browser; the app window stays on the game
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(origin)) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  // F11: full screen on and off
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && win) win.setFullScreen(!win.isFullScreen());
  });
  win.on('closed', () => (win = null));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const { server, leaderboard } = createApp({ staticDir, dataDir: app.getPath('userData') });
  const port = await listen(server);
  const ip = lanAddress();
  lanHost = ip ? `${ip}:${port}` : null;
  ipcMain.on('spidi:lan-host', (e) => (e.returnValue = lanHost));
  // pending leaderboard entries must not get lost when the app closes
  app.on('before-quit', () => leaderboard.flushSync());
  createWindow(port);
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());

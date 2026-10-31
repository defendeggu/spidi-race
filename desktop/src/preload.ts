import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between the app and the game: the address other players in the home network
 * open (the game itself runs at 127.0.0.1 inside the app). Nothing else of Node or Electron is exposed.
 */
contextBridge.exposeInMainWorld('spidiDesktop', {
  lanHost: ipcRenderer.sendSync('spidi:lan-host') as string | null,
});

import type { ClientMsg, ServerMsg } from '@spidi/shared';

type Handler = (msg: ServerMsg) => void;

/** WebSocket connection to the game server (same host that served the page). */
export class Net {
  private ws: WebSocket | null = null;
  clientId = '';
  private handlers = new Set<Handler>();
  onClose: (() => void) | null = null;

  connect(url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let welcomed = false;
      const timer = setTimeout(() => {
        if (!welcomed) {
          ws.close();
          reject(new Error('Zeitüberschreitung beim Verbinden'));
        }
      }, 5000);
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.type === 'welcome') {
          this.clientId = msg.clientId;
          welcomed = true;
          clearTimeout(timer);
          resolve();
        }
        for (const h of this.handlers) h(msg);
      };
      ws.onerror = () => {
        if (!welcomed) {
          clearTimeout(timer);
          reject(new Error('Server nicht erreichbar'));
        }
      };
      ws.onclose = () => {
        if (welcomed) this.onClose?.();
      };
    });
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.onClose = null;
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}

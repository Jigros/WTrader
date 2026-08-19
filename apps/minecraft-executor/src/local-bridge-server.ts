import { WebSocketServer, type WebSocket } from 'ws';
import type { ExternalTransport } from '@wtrader/game-client';
import { parseInboundMessage, type OutboundProtocolMessage } from '@wtrader/protocol';

export interface LocalBridgeServerOptions {
  readonly host: string;
  readonly port: number;
  readonly token?: string | undefined;
  readonly maximumFrameBytes: number;
}

export class LocalBridgeServer implements ExternalTransport {
  private server: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private handler: ((message: unknown) => void) | null = null;

  constructor(private readonly options: LocalBridgeServerOptions) {}

  connect(handler: (message: unknown) => void): Promise<void> {
    this.handler = handler;
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ host: this.options.host, port: this.options.port, maxPayload: this.options.maximumFrameBytes });
      this.server.once('listening', resolve);
      this.server.once('error', reject);
      this.server.on('connection', (socket, request) => {
        if (this.socket !== null || !this.authorized(request.headers.authorization)) {
          socket.close(1008, 'Unauthorized or bridge already connected');
          return;
        }
        this.socket = socket;
        socket.on('message', (payload, isBinary) => {
          if (isBinary) {
            socket.close(1009, 'Invalid bridge frame');
            return;
          }
          const bytes = Buffer.isBuffer(payload) ? payload : Array.isArray(payload) ? Buffer.concat(payload) : Buffer.from(payload);
          const text = bytes.toString('utf8');
          if (Buffer.byteLength(text, 'utf8') > this.options.maximumFrameBytes) {
            socket.close(1009, 'Invalid bridge frame');
            return;
          }
          try {
            this.handler?.(parseInboundMessage(JSON.parse(text) as unknown));
          } catch {
            socket.close(1007, 'Invalid JSON');
          }
        });
        socket.on('close', () => { this.socket = null; });
      });
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket?.close();
      this.server?.close(() => { resolve(); });
      if (this.server === null) { resolve(); }
      this.server = null;
      this.socket = null;
    });
  }

  send(message: OutboundProtocolMessage): Promise<unknown> {
    void message;
    return Promise.reject(new Error('Bridge is observe-only; outbound game actions are disabled'));
  }

  private authorized(header: string | undefined): boolean {
    if (this.options.token === undefined) return true;
    return header === `Bearer ${this.options.token}`;
  }
}

import { WebSocket, WebSocketServer } from 'ws';

export class SimulationServer {
  private server?: WebSocketServer;
  private readonly enabled: boolean;
  private readonly port: number;

  constructor(enabled: boolean, port: number) {
    this.enabled = enabled;
    this.port = port;
  }

  start(): void {
    if (!this.enabled) return;
    this.server = new WebSocketServer({ port: this.port });
    this.server.on('listening', () => {
      console.log(`Simulation WebSocket listening on port ${this.port}`);
    });
  }

  broadcast(data: Buffer): void {
    this.server?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
  }

  stop(): void {
    this.server?.clients.forEach((client) => client.close());
    this.server?.close();
    this.server = undefined;
  }
}

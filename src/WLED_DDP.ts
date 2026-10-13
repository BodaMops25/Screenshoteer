import * as dgram from 'node:dgram';
import { WLEDClient } from 'wled-client';
import type { RGB } from './utils.ts';

export interface WledConnectionOptions {
  host: string;
  port: number;
  reconnectIntervalMs: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  onStatusChange?: (connected: boolean) => void;
}

export class WLEDDdp {
  private static readonly MAX_LED_DATA_PER_PACKET = 1440;
  private readonly socket = dgram.createSocket('udp4');
  private readonly client: WLEDClient;
  private healthTimer?: NodeJS.Timeout;
  private connected = false;
  private checking = false;
  private readonly options: WledConnectionOptions;

  constructor(options: WledConnectionOptions) {
    this.options = options;
    this.client = new WLEDClient({
      host: options.host,
      websocket: false,
    });
  }

  async connectUntilAvailable(signal?: AbortSignal): Promise<void> {
    while (!signal?.aborted) {
      try {
        await this.connect();
        return;
      } catch {
        this.setConnected(false);
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, this.options.reconnectIntervalMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve(undefined);
          }, { once: true });
        });
      }
    }
    throw new Error('WLED connection cancelled');
  }

  async connect(): Promise<void> {
    await this.client.init();
    if (!this.client.state.on) await this.client.turnOn();
    this.setConnected(true);
  }

  startMonitoring(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => void this.checkConnection(), this.options.healthCheckIntervalMs);
    this.healthTimer.unref();
  }

  getSelectedSegment(): { start: number; length: number } | undefined {
    const segment = this.client.state.segments.find((candidate) => candidate.selected)
      ?? this.client.state.segments[0];
    if (!segment || segment.start === undefined || segment.length === undefined) return undefined;
    return { start: segment.start, length: segment.length };
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendRaw(data: Buffer, offset = 0): void {
    if (!this.connected) return;

    let chunkOffset = 0;
    do {
      const chunk = data.subarray(
        chunkOffset,
        chunkOffset + WLEDDdp.MAX_LED_DATA_PER_PACKET,
      );
      const packet = this.createPacket(chunk, offset + chunkOffset);
      this.socket.send(packet, this.options.port, this.options.host, (error) => {
        if (error) this.setConnected(false);
      });
      chunkOffset += WLEDDdp.MAX_LED_DATA_PER_PACKET;
    } while (chunkOffset < data.length);
  }

  stop(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    try {
      this.socket.close();
    } catch {
      // A UDP socket that never sent a packet was never bound and needs no close.
    }
  }

  private async checkConnection(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const response = await fetch(`http://${this.options.host}/json/info`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(this.options.healthCheckTimeoutMs),
      });

      if (!response.ok) throw new Error(`WLED health check returned ${response.status}`);
      if (!this.connected) await this.connect();
    } catch {
      this.setConnected(false);
    } finally {
      this.checking = false;
    }
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.options.onStatusChange?.(connected);
  }

  private createPacket(data: Buffer, offset: number): Buffer {
    const header = Buffer.alloc(10);
    header[0] = 0b01000000;
    header[3] = 0b00000001;
    header.writeUInt32BE(offset, 4);
    header.writeUInt16BE(data.length, 8);
    return Buffer.concat([header, data]);
  }

  send(colors: RGB[]): void {
    const data = Buffer.concat(colors.map((color) => Buffer.from(color)));
    this.sendRaw(data);
  }
}

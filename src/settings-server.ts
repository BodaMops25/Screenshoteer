import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ScreenCapture } from './screen-capture.ts';
import { loadWebSettings, saveWebSettings } from './settings-store.ts';

const SETTINGS_PAGE = fileURLToPath(new URL('../settings/index.html', import.meta.url));

export class SettingsServer {
  private readonly port: number;
  private readonly onRestart?: () => void;
  private server?: Server;

  constructor(port = 8090, onRestart?: () => void) {
    this.port = port;
    this.onRestart = onRestart;
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });

    return new Promise((resolve, reject) => {
      const server = this.server!;
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(this.port, '127.0.0.1', () => {
        server.off('error', onError);
        server.on('error', (error) => console.error('Settings server error:', error));
        console.log(`Settings: http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (request.method === 'GET' && url.pathname === '/api/settings') {
        this.json(response, 200, loadWebSettings());
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/settings') {
        const body = await this.readJsonBody(request);
        const settings = await saveWebSettings(body);
        this.json(response, 200, {
          settings,
          restartRequired: true,
          message: 'Settings saved. Restart Screenshoteer to apply them.',
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/monitors') {
        this.json(response, 200, await ScreenCapture.getMonitors());
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/restart') {
        if (!this.onRestart) {
          this.json(response, 503, { error: 'Restart is not available' });
          return;
        }
        this.json(response, 202, { message: 'Screenshoteer is restarting…' });
        setTimeout(() => this.onRestart?.(), 150).unref();
        return;
      }
      if (request.method === 'GET' && (
        url.pathname === '/'
        || url.pathname === '/settings'
        || url.pathname === '/index.html'
      )) {
        const page = await readFile(SETTINGS_PAGE);
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(page);
        return;
      }

      this.json(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.json(response, 400, { error: message });
    }
  }

  private readJsonBody(request: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let length = 0;
      request.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 1_000_000) {
          reject(new Error('Settings request is too large'));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid settings JSON'));
        }
      });
      request.on('error', reject);
    });
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
  }
}

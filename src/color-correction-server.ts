import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { OUTPUT, WLED } from './config.ts';
import { correctLedPixel, type RGB } from './utils.ts';
import { WLEDDdp } from './WLED_DDP.ts';

const LED_COUNT = 720;
const LED_OFFSET = 0;
const APP_PORT = 8081;
const indexPath = resolve(process.cwd(), 'color-correction/index.html');
let currentColor: RGB | undefined;

const wled = new WLEDDdp({ ...WLED });

function sendSolidColor(color: RGB): void {
  const corrected = correctLedPixel(
    color,
    OUTPUT.ledBlackPoints,
    OUTPUT.ledLowRangeGammas,
    OUTPUT.ledMatchPoint,
  );
  const data = Buffer.alloc(LED_COUNT * 3);
  for (let offset = 0; offset < data.length; offset += 3) data.set(corrected, offset);
  wled.sendRaw(data, LED_OFFSET * 3);
}

const server = createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  createReadStream(indexPath).pipe(response);
});

const webSockets = new WebSocketServer({ server });
webSockets.on('connection', (client) => {
  client.on('message', (message) => {
    try {
      const { red, green, blue } = JSON.parse(message.toString()) as Record<string, unknown>;
      const channels = [red, green, blue];
      if (!channels.every((value) => (
        Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255
      ))) throw new Error('RGB channels must be integers from 0 to 255');

      currentColor = channels.map(Number) as RGB;
      sendSolidColor(currentColor);
    } catch (error) {
      client.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Invalid color',
      }));
    }
  });
});

const refreshTimer = setInterval(() => {
  if (currentColor) sendSolidColor(currentColor);
}, 250);

server.listen(APP_PORT, '0.0.0.0', () => {
  console.log(`Color correction: http://localhost:${APP_PORT}`);
});

await wled.connectUntilAvailable();
wled.startMonitoring();

const stop = (): void => {
  clearInterval(refreshTimer);
  webSockets.close();
  server.close();
  wled.stop();
  process.exit();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

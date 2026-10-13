import { DEBUG, MODE, OUTPUT, WLED } from './config.ts';
import { Dashboard } from './dashboard.ts';
import { MusicMode } from './modes/music-mode.ts';
import { ScreenCaptureMode } from './modes/screen-capture-mode.ts';
import type { AppModeController } from './modes/types.ts';
import { OutputProcessor, type OutputAdjustmentName } from './output-processor.ts';
import { SimulationServer } from './simulation-server.ts';
import { WLEDDdp } from './WLED_DDP.ts';

if (process.platform !== 'win32') {
  throw new Error('Screenshoteer currently supports Windows only');
}

const dashboard = new Dashboard(DEBUG.logs);
const simulation = new SimulationServer(DEBUG.simulation, DEBUG.simulationPort);
const abortController = new AbortController();
let modeController: AppModeController | undefined;
let shuttingDown = false;
const outputProcessor = new OutputProcessor({
  brightness: OUTPUT.brightness,
  contrast: OUTPUT.contrast,
  saturation: OUTPUT.saturation,
  gamma: OUTPUT.gamma,
  blur: OUTPUT.blur,
}, OUTPUT);

const wled = new WLEDDdp({
  ...WLED,
  onStatusChange: (connected) => dashboard.set('WLED', connected ? 'connected' : 'offline'),
});

async function start(): Promise<void> {
  dashboard.set('Mode', MODE);
  dashboard.set('WLED', DEBUG.noWled ? 'disabled' : 'connecting');

  let ledCount: number = DEBUG.fallbackLedCount;
  let ledOffset = 0;

  if (!DEBUG.noWled) {
    await wled.connectUntilAvailable(abortController.signal);
    const segment = wled.getSelectedSegment();
    if (!segment) throw new Error('No selected WLED segment');
    ledCount = segment.length;
    ledOffset = segment.start;
    wled.startMonitoring();
  }

  dashboard.set('LEDs', ledCount);
  simulation.start();

  let lastFrameAt: number | undefined;
  const sendFrame = (source: Buffer): void => {
    const processingStartedAt = performance.now();
    const frame = outputProcessor.process(source);
    dashboard.sample('Process ms', performance.now() - processingStartedAt);

    const now = performance.now();
    if (lastFrameAt !== undefined) {
      const averageMs = dashboard.sample('Frame ms', now - lastFrameAt);
      dashboard.set('FPS', averageMs > 0 ? 1_000 / averageMs : 0);
    }
    lastFrameAt = now;
    dashboard.set('Time', new Date().toLocaleTimeString());

    simulation.broadcast(frame);
    if (!DEBUG.noWled) wled.sendRaw(frame, ledOffset * 3);
  };

  const context = {
    ledCount,
    frameRate: OUTPUT.fps,
    dashboard,
    sendFrame,
  };

  modeController = MODE === 'music'
    ? new MusicMode(context)
    : new ScreenCaptureMode(context);
  await modeController.start();
}

function shutdown(exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  abortController.abort();
  modeController?.stop();
  simulation.stop();
  wled.stop();
  dashboard.stop();
  process.exit(exitCode);
}

process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());
process.stdin.setEncoding('utf8');
process.stdin.on('data', (command) => {
  for (const line of command.toString().split(/\r?\n/)) {
    const input = line.trim().toLowerCase();
    if (!input) continue;
    if (input === 'quit') {
      shutdown();
      return;
    }
    if (input === 'settings') {
      console.log(outputProcessor.get());
      continue;
    }

    const match = /^(b|c|s|g|blr)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(input);
    if (match) {
      const names: Record<string, OutputAdjustmentName> = {
        b: 'brightness',
        c: 'contrast',
        s: 'saturation',
        g: 'gamma',
        blr: 'blur',
      };
      const name = names[match[1]];
      const value = outputProcessor.set(name, Number(match[2]));
      dashboard.set(name[0].toUpperCase() + name.slice(1), value);
      continue;
    }
    console.log('Commands: b <brightness>, c <contrast>, s <saturation>, g <gamma>, blr <blur>, settings, quit');
  }
});

start().catch((error) => {
  console.error(error);
  shutdown(1);
});

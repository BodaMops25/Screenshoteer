import {
  DEBUG,
  MODE,
  MUSIC,
  OUTPUT,
  OUTPUT_PROFILES,
  WLED,
  type AppMode,
  type MusicAudioMode,
  type OutputProfileName,
} from './config.ts';
import { Dashboard } from './dashboard.ts';
import { MusicMode } from './modes/music-mode.ts';
import { ScreenCaptureMode } from './modes/screen-capture-mode.ts';
import type { AppModeController, ModeContext } from './modes/types.ts';
import {
  OutputProcessor,
  type OutputAdjustmentName,
  type OutputAdjustments,
} from './output-processor.ts';
import { SimulationServer } from './simulation-server.ts';
import { SettingsServer } from './settings-server.ts';
import { WLEDDdp } from './WLED_DDP.ts';
import type { WebSettings } from './settings-store.ts';

if (process.platform !== 'win32') {
  throw new Error('Screenshoteer currently supports Windows only');
}

const dashboard = new Dashboard(DEBUG.logs);
const simulation = new SimulationServer(DEBUG.simulation, DEBUG.simulationPort);
const settingsServer = new SettingsServer(8090, restart, applySavedSettings);
const abortController = new AbortController();
let modeController: AppModeController | undefined;
let modeContext: ModeContext | undefined;
let currentMode: AppMode | undefined;
let musicAudioMode: MusicAudioMode = MUSIC.audioMode;
let modeSwitch = Promise.resolve();
let shuttingDown = false;
let activeOutputProfile: OutputProfileName = 'screen-capture';
const outputProfiles: Record<OutputProfileName, OutputAdjustments> = {
  'screen-capture': { ...OUTPUT_PROFILES['screen-capture'] },
  'music-current': { ...OUTPUT_PROFILES['music-current'] },
  'music-bands': { ...OUTPUT_PROFILES['music-bands'] },
  'music-spectrum': { ...OUTPUT_PROFILES['music-spectrum'] },
};
const outputProcessor = new OutputProcessor(outputProfiles[activeOutputProfile], OUTPUT);

const wled = new WLEDDdp({
  ...WLED,
  onStatusChange: (connected) => dashboard.set('WLED', connected ? 'connected' : 'offline'),
});

async function start(): Promise<void> {
  await settingsServer.start();
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

  modeContext = {
    ledCount,
    frameRate: OUTPUT.fps,
    dashboard,
    sendFrame,
  };

  await switchMode(MODE);
}

async function switchMode(mode: AppMode): Promise<void> {
  if (!modeContext) throw new Error('Application is not ready to switch modes');
  if (mode === currentMode) return;

  modeController?.stop();
  modeController = undefined;
  currentMode = undefined;
  applyOutputProfile(getOutputProfileName(mode, musicAudioMode));
  const nextController = mode === 'music'
    ? new MusicMode(modeContext, musicAudioMode)
    : new ScreenCaptureMode(modeContext);
  try {
    await nextController.start();
  } catch (error) {
    nextController.stop();
    throw error;
  }
  modeController = nextController;
  currentMode = mode;
  dashboard.set('Mode', mode);
}

function getOutputProfileName(
  mode: AppMode,
  audioMode: MusicAudioMode,
): OutputProfileName {
  return mode === 'screen-capture' ? mode : `music-${audioMode}`;
}

function applyOutputProfile(name: OutputProfileName): void {
  activeOutputProfile = name;
  outputProcessor.setAll(outputProfiles[name]);
  dashboard.set('Output profile', name);
  for (const [setting, value] of Object.entries(outputProcessor.get())) {
    dashboard.set(setting[0].toUpperCase() + setting.slice(1), value);
  }
}

function queueModeSwitch(mode: AppMode): Promise<void> {
  modeSwitch = modeSwitch
    .then(() => switchMode(mode))
    .catch((error) => console.error(`Could not switch to ${mode} mode:`, error));
  return modeSwitch;
}

async function applySavedSettings(settings: WebSettings): Promise<void> {
  for (const name of Object.keys(outputProfiles) as OutputProfileName[]) {
    Object.assign(outputProfiles[name], settings.profiles[name]);
  }
  Object.assign(MUSIC, settings.music);
  musicAudioMode = settings.audioMode;

  if (modeController instanceof MusicMode) {
    modeController.setAudioMode(musicAudioMode);
  }
  if (settings.mode === currentMode) {
    applyOutputProfile(getOutputProfileName(settings.mode, musicAudioMode));
  } else {
    await queueModeSwitch(settings.mode);
  }
}

function shutdown(exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  abortController.abort();
  modeController?.stop();
  simulation.stop();
  settingsServer.stop();
  wled.stop();
  dashboard.stop();
  process.exit(exitCode);
}

function restart(): void {
  shutdown(75);
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
      console.log({ profile: activeOutputProfile, ...outputProcessor.get() });
      continue;
    }
    const modeMatch = /^mode\s+([01])$/.exec(input);
    if (modeMatch) {
      void queueModeSwitch(modeMatch[1] === '1' ? 'music' : 'screen-capture');
      continue;
    }
    const audioModeMatch = /^audiomode\s+([012])$/.exec(input);
    if (audioModeMatch) {
      const audioModes: MusicAudioMode[] = ['current', 'bands', 'spectrum'];
      musicAudioMode = audioModes[Number(audioModeMatch[1])];
      if (modeController instanceof MusicMode) {
        modeController.setAudioMode(musicAudioMode);
        applyOutputProfile(getOutputProfileName('music', musicAudioMode));
      } else {
        dashboard.set('Audio mode', musicAudioMode);
      }
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
      outputProfiles[activeOutputProfile][name] = value;
      dashboard.set(name[0].toUpperCase() + name.slice(1), value);
      continue;
    }
    console.log('Commands: mode <0 screen|1 music>, audiomode <0 current|1 bands|2 spectrum>, b <brightness>, c <contrast>, s <saturation>, g <gamma>, blr <blur>, settings, quit');
  }
});

start().catch((error) => {
  console.error(error);
  shutdown(1);
});

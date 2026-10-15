import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isSea } from 'node:sea';
import { DEV } from './dev.ts';

export type AppMode = 'music' | 'screen-capture';
export type MusicAudioMode = 'bands' | 'spectrum' | 'current';
export type OutputProfileName =
  | 'screen-capture'
  | 'music-current'
  | 'music-bands'
  | 'music-spectrum';

export interface ColorProfileSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  blur: number;
}

export interface WebSettings {
  wled: { host: string; port: number };
  output: {
    fps: number;
    ledBlackPoints: [number, number, number];
    ledMatchPoint: number;
  };
  mode: AppMode;
  audioMode: MusicAudioMode;
  profiles: Record<OutputProfileName, ColorProfileSettings>;
  music: {
    coverTransitionMs: number;
    idlePulseMinimum: number;
    idlePulsePeriodMs: number;
  };
  monitor: string;
  debug: {
    simulation: boolean;
    simulationPort: number;
    noWled: boolean;
    fallbackLedCount: number;
  };
}

const moduleDirectory = typeof __dirname === 'string'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));
export const SETTINGS_FILE = isSea()
  ? resolve(dirname(process.execPath), 'settings.json')
  : resolve(moduleDirectory, '..', 'settings.json');

const DEFAULT_PROFILE: ColorProfileSettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  blur: 0,
};

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  wled: { host: '192.168.1.18', port: 4048 },
  output: {
    fps: 60,
    ledBlackPoints: [24, 24, 24],
    ledMatchPoint: 128,
  },
  mode: 'screen-capture',
  audioMode: 'spectrum',
  profiles: {
    'screen-capture': { ...DEFAULT_PROFILE },
    'music-current': { ...DEFAULT_PROFILE },
    'music-bands': { ...DEFAULT_PROFILE },
    'music-spectrum': { ...DEFAULT_PROFILE },
  },
  music: {
    coverTransitionMs: 1_200,
    idlePulseMinimum: 0.8,
    idlePulsePeriodMs: 2_000,
  },
  monitor: '\\\\.\\DISPLAY2',
  debug: {
    simulation: true,
    simulationPort: 8080,
    noWled: true,
    fallbackLedCount: 100,
  },
};

export function loadWebSettings(): WebSettings {
  try {
    return sanitizeWebSettings(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (DEV && code !== 'ENOENT') console.error('Could not load settings.json:', error);
    return structuredClone(DEFAULT_WEB_SETTINGS);
  }
}

export async function saveWebSettings(
  value: unknown,
  allowDebugChanges = true,
): Promise<WebSettings> {
  const settings = sanitizeWebSettings(value);
  if (!allowDebugChanges) settings.debug = loadWebSettings().debug;
  await writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return settings;
}

export function sanitizeWebSettings(value: unknown): WebSettings {
  const root = asRecord(value);
  const wled = asRecord(root.wled);
  const output = asRecord(root.output);
  const profiles = asRecord(root.profiles);
  const music = asRecord(root.music);
  const debug = asRecord(root.debug);
  const blackPoints = Array.isArray(output.ledBlackPoints)
    ? output.ledBlackPoints
    : DEFAULT_WEB_SETTINGS.output.ledBlackPoints;

  return {
    wled: {
      host: stringValue(wled.host, DEFAULT_WEB_SETTINGS.wled.host),
      port: integer(wled.port, 1, 65_535, DEFAULT_WEB_SETTINGS.wled.port),
    },
    output: {
      fps: integer(output.fps, 1, 240, DEFAULT_WEB_SETTINGS.output.fps),
      ledBlackPoints: [0, 1, 2].map((index) => integer(
        blackPoints[index],
        0,
        254,
        DEFAULT_WEB_SETTINGS.output.ledBlackPoints[index],
      )) as [number, number, number],
      ledMatchPoint: integer(
        output.ledMatchPoint,
        1,
        255,
        DEFAULT_WEB_SETTINGS.output.ledMatchPoint,
      ),
    },
    mode: root.mode === 'music' ? 'music' : 'screen-capture',
    audioMode: isAudioMode(root.audioMode) ? root.audioMode : DEFAULT_WEB_SETTINGS.audioMode,
    profiles: {
      'screen-capture': sanitizeProfile(profiles['screen-capture']),
      'music-current': sanitizeProfile(profiles['music-current']),
      'music-bands': sanitizeProfile(profiles['music-bands']),
      'music-spectrum': sanitizeProfile(profiles['music-spectrum']),
    },
    music: {
      coverTransitionMs: integer(
        music.coverTransitionMs, 0, 60_000, DEFAULT_WEB_SETTINGS.music.coverTransitionMs,
      ),
      idlePulseMinimum: numberValue(
        music.idlePulseMinimum, 0, 1, DEFAULT_WEB_SETTINGS.music.idlePulseMinimum,
      ),
      idlePulsePeriodMs: integer(
        music.idlePulsePeriodMs, 100, 60_000, DEFAULT_WEB_SETTINGS.music.idlePulsePeriodMs,
      ),
    },
    monitor: stringValue(root.monitor, ''),
    debug: {
      simulation: booleanValue(debug.simulation, DEFAULT_WEB_SETTINGS.debug.simulation),
      simulationPort: integer(
        debug.simulationPort, 1, 65_535, DEFAULT_WEB_SETTINGS.debug.simulationPort,
      ),
      noWled: booleanValue(debug.noWled, DEFAULT_WEB_SETTINGS.debug.noWled),
      fallbackLedCount: integer(
        debug.fallbackLedCount, 1, 100_000, DEFAULT_WEB_SETTINGS.debug.fallbackLedCount,
      ),
    },
  };
}

function sanitizeProfile(value: unknown): ColorProfileSettings {
  const profile = asRecord(value);
  return {
    brightness: numberValue(profile.brightness, -1, 1, DEFAULT_PROFILE.brightness),
    contrast: numberValue(profile.contrast, 0, 4, DEFAULT_PROFILE.contrast),
    saturation: numberValue(profile.saturation, 0, 4, DEFAULT_PROFILE.saturation),
    gamma: numberValue(profile.gamma, 0.1, 10, DEFAULT_PROFILE.gamma),
    blur: integer(profile.blur, 0, 100, DEFAULT_PROFILE.blur),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isAudioMode(value: unknown): value is MusicAudioMode {
  return value === 'current' || value === 'bands' || value === 'spectrum';
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.round(numberValue(value, minimum, maximum, fallback));
}

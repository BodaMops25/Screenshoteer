export type AppMode = 'music' | 'screen-capture';
export type MusicAudioMode = 'bands' | 'spectrum' | 'current';
export type MusicColorMode = 'main' | 'palette';
export type OutputProfileName =
  | 'screen-capture'
  | 'music-current'
  | 'music-bands'
  | 'music-spectrum';

export const MODE: AppMode = 'screen-capture';

export const WLED = {
  host: '192.168.1.18',
  port: 4048,
  reconnectIntervalMs: 3_000,
  healthCheckIntervalMs: 3_000,
  healthCheckTimeoutMs: 1_500,
} as const;

export const OUTPUT = {
  fps: 60,
  ledBlackPoints: [24, 24, 24] as const,
  ledLowRangeGammas: [1.5, 1.5, 1.5] as const,
  ledMatchPoint: 128,
} as const;

export const OUTPUT_PROFILES = {
  'screen-capture': {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    gamma: 1,
    blur: 0,
  },
  'music-current': {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    gamma: 1,
    blur: 0,
  },
  'music-bands': {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    gamma: 1,
    blur: 0,
  },
  'music-spectrum': {
    brightness: 0,
    contrast: 1,
    saturation: 1,
    gamma: 1,
    blur: 0,
  },
} as const;

export const MUSIC = {
  audioMode: 'spectrum' as MusicAudioMode,
  colorMode: 'palette' as MusicColorMode,
  paletteColorCount: 12,
  minimumColorProportion: 0.06,
  paletteSaturation: 1.5,
  coverTransitionMs: 1_200,
  idlePulseMinimum: 0.8,
  idlePulsePeriodMs: 2_000,
} as const;

export const SCREEN_CAPTURE = {
  source: 'desktop',
  monitor: '\\\\.\\DISPLAY2',
} as const;

export const DEBUG = {
  logs: true,
  simulation: true,
  simulationPort: 8080,
  noWled: true,
  fallbackLedCount: 100,
} as const;

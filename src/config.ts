import {
  loadWebSettings,
  type AppMode,
  type MusicAudioMode,
} from './settings-store.ts';

export type { AppMode, MusicAudioMode, OutputProfileName } from './settings-store.ts';
export type MusicColorMode = 'main' | 'palette';
const SETTINGS = loadWebSettings();

export const MODE: AppMode = SETTINGS.mode;

export const WLED = {
  host: SETTINGS.wled.host,
  port: SETTINGS.wled.port,
  reconnectIntervalMs: 3_000,
  healthCheckIntervalMs: 3_000,
  healthCheckTimeoutMs: 1_500,
} as const;

export const OUTPUT = {
  fps: SETTINGS.output.fps,
  ledBlackPoints: SETTINGS.output.ledBlackPoints,
  ledLowRangeGammas: [1.5, 1.5, 1.5] as const,
  ledMatchPoint: SETTINGS.output.ledMatchPoint,
} as const;

export const OUTPUT_PROFILES = SETTINGS.profiles;

export const MUSIC = {
  audioMode: SETTINGS.audioMode as MusicAudioMode,
  colorMode: 'palette' as MusicColorMode,
  paletteColorCount: 12,
  minimumColorProportion: 0.06,
  paletteSaturation: 1.5,
  coverTransitionMs: SETTINGS.music.coverTransitionMs,
  idlePulseMinimum: SETTINGS.music.idlePulseMinimum,
  idlePulsePeriodMs: SETTINGS.music.idlePulsePeriodMs,
} as const;

export const SCREEN_CAPTURE = {
  source: 'desktop',
  monitor: SETTINGS.monitor,
} as const;

export const DEBUG = {
  logs: true,
  simulation: SETTINGS.debug.simulation,
  simulationPort: SETTINGS.debug.simulationPort,
  noWled: SETTINGS.debug.noWled,
  fallbackLedCount: SETTINGS.debug.fallbackLedCount,
} as const;

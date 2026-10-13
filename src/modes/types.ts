import type { Dashboard } from '../dashboard.ts';

export interface ModeContext {
  ledCount: number;
  frameRate: number;
  dashboard: Dashboard;
  sendFrame: (frame: Buffer) => void;
}

export interface AppModeController {
  start(): Promise<void> | void;
  stop(): void;
}

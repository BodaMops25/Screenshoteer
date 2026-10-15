import crypto from 'node:crypto';
import {
  SMTCMonitor,
  type PlaybackInfo,
} from '@coooookies/windows-smtc-monitor';
import { reportError } from './error-reporter.ts';

export interface MediaMonitorOptions {
  onCoverChange?: (coverBinary: Buffer) => void | Promise<void>;
  onStopped?: () => void;
  onPlaying?: () => void;
}

export class MediaMonitor {
  private readonly onCoverChange: (coverBinary: Buffer) => void | Promise<void>;
  private readonly onPlaying?: () => void;
  private readonly onStopped?: () => void;
  private monitor: SMTCMonitor | null = null;
  private coverHash: string | null = null;

  constructor({ onCoverChange, onStopped, onPlaying }: MediaMonitorOptions = {}) {
    this.onCoverChange = onCoverChange ?? (() => {});
    this.onPlaying = onPlaying;
    this.onStopped = onStopped;
  }

  start(): void {
    this.monitor = new SMTCMonitor();
    const refresh = (): void => { void this.emitCurrent(); };
    this.monitor.on('session-media-changed', refresh);
    this.monitor.on('session-playback-changed', (_appId: string, playbackInfo: PlaybackInfo) => {
      if ((playbackInfo.playbackStatus === 3 || playbackInfo.playbackStatus === 5) && this.onStopped) this.onStopped();
      else if (playbackInfo.playbackStatus === 4 && this.onPlaying) this.onPlaying();
      else refresh();
    });
    this.monitor.on('session-added', refresh);
    this.monitor.on('session-removed', refresh);
    this.monitor.on('current-session-changed', refresh);
    void this.emitCurrent();
  }

  async emitCurrent(): Promise<void> {
    try {
      const session = SMTCMonitor.getCurrentMediaSession();
      if (!session) {
        this.onStopped?.();
        return;
      }

      if (session.playback.playbackStatus === 4) this.onPlaying?.();
      else this.onStopped?.();

      const thumbnailBinary = session?.media.thumbnail;

      if (!thumbnailBinary) return;

      const hash = crypto.createHash('sha256').update(thumbnailBinary).digest('hex');
      if (hash === this.coverHash) return;

      this.coverHash = hash;
      await this.onCoverChange(thumbnailBinary);
    } catch (error) {
      reportError('Windows media monitoring failed', error);
    }
  }

  stop(): void {
    this.monitor?.destroy();
    this.monitor = null;
  }
}

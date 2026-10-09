import crypto from 'node:crypto';
import {
  SMTCMonitor,
  type PlaybackInfo,
} from '@coooookies/windows-smtc-monitor';

export interface MediaMonitorOptions {
  onCoverChange?: (coverBinary: Buffer) => void | Promise<void>;
  onStoped?: () => void;
  onPlaying?: () => void;
}

export class MediaMonitor {
  private readonly onCoverChange: (coverBinary: Buffer) => void | Promise<void>;
  private readonly onPlaying?: () => void;
  private readonly onStoped?: () => void;
  private monitor: SMTCMonitor | null = null;
  private coverHash: string | null = null;

  constructor({ onCoverChange, onStoped, onPlaying }: MediaMonitorOptions = {}) {
    this.onCoverChange = onCoverChange!;
    this.onPlaying = onPlaying;
    this.onStoped = onStoped;
  }

  start(): void {
    this.monitor = new SMTCMonitor();
    const refresh = (): void => { void this.emitCurrent(); };
    this.monitor.on('session-media-changed', refresh);
    this.monitor.on('session-playback-changed', (_appId: string, playbackInfo: PlaybackInfo) => {
      if ((playbackInfo.playbackStatus === 3 || playbackInfo.playbackStatus === 5) && this.onStoped) this.onStoped();
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
      const thumbnailBinary = session?.media.thumbnail;

      if (!thumbnailBinary) return;

      const hash = crypto.createHash('sha256').update(thumbnailBinary).digest('hex');
      if (hash === this.coverHash) return;

      this.coverHash = hash;
      this.onCoverChange(thumbnailBinary);
    } catch (error) {
      console.error(error);
    }
  }

  stop(): void {
    this.monitor?.destroy();
    this.monitor = null;
  }
}

import { SCREEN_CAPTURE } from '../config.ts';
import { DEV } from '../dev.ts';
import { ScreenCapture } from '../screen-capture.ts';
import type { AppModeController, ModeContext } from './types.ts';

export class ScreenCaptureMode implements AppModeController {
  private capture?: ScreenCapture;
  private readonly context: ModeContext;

  constructor(context: ModeContext) {
    this.context = context;
  }

  async start(): Promise<void> {
    this.capture = new ScreenCapture({
      ...SCREEN_CAPTURE,
      ledCount: this.context.ledCount,
      frameRate: this.context.frameRate,
      onFrame: (frame) => this.context.sendFrame(frame),
    });
    const monitor = await this.capture.start();
    if (DEV) this.context.dashboard.set('Capture', monitor.name);
  }

  stop(): void {
    this.capture?.stop();
    this.capture = undefined;
  }
}

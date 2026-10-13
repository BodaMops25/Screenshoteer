import { SCREEN_CAPTURE } from '../config.ts';
import { ScreenCapture } from '../screen-capture.ts';
import type { AppModeController, ModeContext } from './types.ts';

export class ScreenCaptureMode implements AppModeController {
  private capture?: ScreenCapture;
  private readonly context: ModeContext;

  constructor(context: ModeContext) {
    this.context = context;
  }

  start(): void {
    this.capture = new ScreenCapture({
      ...SCREEN_CAPTURE,
      ledCount: this.context.ledCount,
      frameRate: this.context.frameRate,
      onFrame: (frame) => this.context.sendFrame(frame),
    });
    this.capture.start();
    this.context.dashboard.set('Capture', SCREEN_CAPTURE.source);
  }

  stop(): void {
    this.capture?.stop();
    this.capture = undefined;
  }
}

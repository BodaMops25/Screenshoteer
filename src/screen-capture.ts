import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface ScreenCaptureOptions {
  ledCount: number;
  frameRate: number;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
  onFrame: (frame: Buffer) => void;
}

export class ScreenCapture {
  private readonly options: ScreenCaptureOptions;
  private process?: ChildProcessWithoutNullStreams;
  private pending = Buffer.alloc(0);

  constructor(options: ScreenCaptureOptions) {
    this.options = options;
  }

  start(): void {
    if (this.process) return;

    const filter = `scale=${this.options.ledCount}:1:flags=area`;

    this.process = spawn('ffmpeg', [
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-framerate', this.options.frameRate.toString(),
      '-f', 'gdigrab',
      '-offset_x', this.options.x.toString(),
      '-offset_y', this.options.y.toString(),
      '-video_size', `${this.options.width}x${this.options.height}`,
      '-i', this.options.source,
      '-vf', filter,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-',
    ], {
      stdio: 'pipe',
      windowsHide: true,
    });

    const frameSize = this.options.ledCount * 3;
    this.process.stdout.on('data', (chunk: Buffer) => {
      this.pending = Buffer.concat([this.pending, chunk]);
      while (this.pending.length >= frameSize) {
        const frame = Buffer.from(this.pending.subarray(0, frameSize));
        this.pending = this.pending.subarray(frameSize);
        this.options.onFrame(frame);
      }
    });

    this.process.stderr.on('data', () => {});
    this.process.once('error', (error) => {
      console.error('Failed to start FFmpeg:', error);
    });
    this.process.once('close', (code) => {
      this.process = undefined;
      if (code !== 0 && code !== null) console.error(`FFmpeg exited with code ${code}`);
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = undefined;
    this.pending = Buffer.alloc(0);
  }
}

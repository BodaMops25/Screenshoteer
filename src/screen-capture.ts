import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface MonitorInfo {
  name: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenCaptureOptions {
  ledCount: number;
  frameRate: number;
  source: string;
  monitor?: string;
  onFrame: (frame: Buffer) => void;
}

export class ScreenCapture {
  private readonly options: ScreenCaptureOptions;
  private process?: ChildProcessWithoutNullStreams;
  private pending = Buffer.alloc(0);

  constructor(options: ScreenCaptureOptions) {
    this.options = options;
  }

  static async getMonitors(): Promise<MonitorInfo[]> {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$screens = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {',
      '[PSCustomObject]@{',
      'name = $_.DeviceName;',
      'primary = $_.Primary;',
      'x = $_.Bounds.X;',
      'y = $_.Bounds.Y;',
      'width = $_.Bounds.Width;',
      'height = $_.Bounds.Height',
      '}',
      '})',
      'ConvertTo-Json -Compress -InputObject $screens',
    ].join('\n');
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
    );
    const monitors = JSON.parse(stdout.trim()) as MonitorInfo[] | MonitorInfo;
    return Array.isArray(monitors) ? monitors : [monitors];
  }

  static async getMonitor(name?: string): Promise<MonitorInfo> {
    const monitors = await ScreenCapture.getMonitors();
    const primary = monitors.find((candidate) => candidate.primary) ?? monitors[0];
    if (!primary) throw new Error('Windows did not report any monitors');

    const requestedName = name?.trim();
    if (!requestedName) return primary;

    const monitor = monitors.find((candidate) => (
      candidate.name.toUpperCase() === requestedName.toUpperCase()
    ));
    if (monitor) return monitor;

    const available = monitors.map((candidate) => candidate.name).join(', ');
    console.error(
      `Monitor "${requestedName}" not found. Using primary monitor "${primary.name}". `
        + `Available monitors: ${available}`,
    );
    return primary;
  }

  async start(): Promise<void> {
    if (this.process) return;
    const monitor = await ScreenCapture.getMonitor(this.options.monitor);

    const filter = `scale=${this.options.ledCount}:1:flags=area`;

    this.process = spawn('ffmpeg', [
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-framerate', this.options.frameRate.toString(),
      '-f', 'gdigrab',
      '-offset_x', monitor.x.toString(),
      '-offset_y', monitor.y.toString(),
      '-video_size', `${monitor.width}x${monitor.height}`,
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

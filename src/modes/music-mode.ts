import { getColor, getPalette, type Color } from 'colorthief';
import loopbackCapture from 'loopback-capture';
import { AudioMeter, type AudioBands } from '../audio-meter.ts';
import { MUSIC } from '../config.ts';
import { MediaMonitor } from '../media-monitor.ts';
import {
  AudioNormalizer,
  changeRgbAbsoluteBrightness,
  changeRgbSaturation,
  interpolateLedArrays,
  ledsArrayToBuffer,
  ledsPaletteSegments,
  type RGB,
} from '../utils.ts';
import type { AppModeController, ModeContext } from './types.ts';

const { LoopbackCapture } = loopbackCapture;

export class MusicMode implements AppModeController {
  private readonly context: ModeContext;
  private readonly capture = new LoopbackCapture();
  private readonly normalizer = new AudioNormalizer();
  private readonly media: MediaMonitor;
  private readonly meter: AudioMeter;
  private frameTimer?: NodeJS.Timeout;
  private isPlaying = false;
  private rawAudioLevel = 0;
  private normalizedAudioLevel = 0;
  private bands: AudioBands;
  private spectrum: number[];
  private currentLeds: RGB[];
  private transitionFrom: RGB[];
  private targetLeds: RGB[];
  private transitionStartedAt = 0;

  constructor(context: ModeContext) {
    this.context = context;
    const initial = ledsPaletteSegments([[0, 25, 255]], context.ledCount);
    this.currentLeds = initial;
    this.transitionFrom = initial;
    this.targetLeds = initial;
    this.spectrum = new Array<number>(context.ledCount).fill(0);
    this.bands = new Array<number>(MUSIC.paletteColorCount).fill(0);

    this.media = new MediaMonitor({
      onCoverChange: (cover) => this.updateCover(cover),
      onPlaying: () => { this.isPlaying = true; },
      onStopped: () => { this.isPlaying = false; },
    });

    this.meter = new AudioMeter({
      onAudioUpdate: (value) => {
        this.rawAudioLevel = value;
        this.normalizedAudioLevel = this.normalizer.update(value);
      },
      onBandsUpdate: MUSIC.audioMode === 'bands'
        ? (bands) => { this.bands = bands; }
        : undefined,
      onSpectrumUpdate: MUSIC.audioMode === 'spectrum'
        ? (spectrum) => { this.spectrum = spectrum; }
        : undefined,
      bandCount: MUSIC.paletteColorCount,
      spectrumSize: MUSIC.audioMode === 'spectrum' ? context.ledCount : 0,
    });
  }

  start(): void {
    this.media.start();
    this.capture.startSystemAudio((chunk: Buffer) => this.meter.push(chunk));
    this.frameTimer = setInterval(() => this.renderFrame(), 1000 / this.context.frameRate);
    this.context.dashboard.set('Audio mode', MUSIC.audioMode);
  }

  stop(): void {
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = undefined;
    this.capture.stop();
    this.media.stop();
  }

  private async updateCover(cover: Buffer): Promise<void> {
    try {
      let extracted: Color[];
      if (MUSIC.colorMode === 'main') {
        const color = await getColor(cover);
        extracted = color ? [color] : [];
      } else {
        extracted = (await getPalette(cover, {
          colorCount: MUSIC.paletteColorCount,
          quality: 1,
        })) ?? [];
      }

      const colors = extracted
        .filter((color) => color.hex() !== '#000000')
        .filter((color) => (
          MUSIC.colorMode === 'main'
          || color.proportion >= MUSIC.minimumColorProportion
        ))
        .map((color) => changeRgbSaturation(color.array(), MUSIC.paletteSaturation));

      if (colors.length === 0) return;
      if (MUSIC.audioMode === 'bands') {
        this.meter.setBandCount(colors.length);
        this.bands = new Array<number>(colors.length).fill(0);
      }
      this.transitionFrom = this.getTransitionedLeds();
      this.targetLeds = ledsPaletteSegments(colors, this.context.ledCount);
      this.transitionStartedAt = performance.now();
      this.context.dashboard.set('Cover colors', colors.length);
    } catch (error) {
      console.error('Could not process media cover:', error);
    }
  }

  private getTransitionedLeds(): RGB[] {
    if (this.transitionStartedAt === 0) return this.targetLeds;
    const progress = (performance.now() - this.transitionStartedAt)
      / MUSIC.coverTransitionMs;
    this.currentLeds = interpolateLedArrays(
      this.transitionFrom,
      this.targetLeds,
      progress,
    );
    if (progress >= 1) this.transitionStartedAt = 0;
    return this.currentLeds;
  }

  private renderFrame(): void {
    const baseLeds = this.getTransitionedLeds();
    let output: RGB[];

    if (!this.isPlaying) {
      const pulseRange = 1 - MUSIC.idlePulseMinimum;
      const phase = performance.now() * Math.PI * 2 / MUSIC.idlePulsePeriodMs;
      const brightness = MUSIC.idlePulseMinimum
        + pulseRange * ((Math.sin(phase) + 1) / 2);
      output = baseLeds.map((led) => changeRgbAbsoluteBrightness(led, brightness));
    } else if (MUSIC.audioMode === 'current') {
      output = baseLeds.map((led) => (
        changeRgbAbsoluteBrightness(led, this.normalizedAudioLevel)
      ));
    } else if (MUSIC.audioMode === 'spectrum') {
      output = baseLeds.map((led, index) => (
        changeRgbAbsoluteBrightness(led, this.spectrum[index] ?? 0)
      ));
    } else {
      output = baseLeds.map((led, index) => {
        const bandIndex = Math.min(
          this.bands.length - 1,
          Math.floor(index * this.bands.length / baseLeds.length),
        );
        return changeRgbAbsoluteBrightness(led, this.bands[bandIndex]);
      });
    }

    this.context.dashboard.set('Media playing', this.isPlaying);
    this.context.dashboard.set('Raw audio', this.rawAudioLevel);
    this.context.dashboard.set('Audio level', this.normalizedAudioLevel);
    this.context.sendFrame(ledsArrayToBuffer(output));
  }
}

import { clamp, correctLedBuffer } from './utils.ts';

export interface OutputAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  blur: number;
}

export interface LedCorrection {
  ledBlackPoints: readonly [number, number, number];
  ledLowRangeGammas: readonly [number, number, number];
  ledMatchPoint: number;
}

export type OutputAdjustmentName = keyof OutputAdjustments;

export class OutputProcessor {
  private readonly adjustments: OutputAdjustments;
  private readonly correction: LedCorrection;
  private blurBuffer = Buffer.alloc(0);

  constructor(adjustments: OutputAdjustments, correction: LedCorrection) {
    this.adjustments = { ...adjustments };
    this.correction = correction;
  }

  set(name: OutputAdjustmentName, value: number): number {
    const limits: Record<OutputAdjustmentName, readonly [number, number]> = {
      brightness: [-1, 1],
      contrast: [0, 4],
      saturation: [0, 4],
      gamma: [0.1, 10],
      blur: [0, 100],
    };
    const [minimum, maximum] = limits[name];
    const normalized = name === 'blur'
      ? Math.round(clamp(value, minimum, maximum))
      : clamp(value, minimum, maximum);
    this.adjustments[name] = normalized;
    return normalized;
  }

  get(): Readonly<OutputAdjustments> {
    return { ...this.adjustments };
  }

  process(source: Buffer): Buffer {
    const frame = Buffer.from(source);
    const { brightness, contrast, saturation, gamma, blur } = this.adjustments;
    const gammaExponent = 1 / gamma;
    const brightnessOffset = brightness * 255;

    for (let offset = 0; offset + 2 < frame.length; offset += 3) {
      const red = frame[offset];
      const green = frame[offset + 1];
      const blue = frame[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

      frame[offset] = this.adjustChannel(
        luminance + (red - luminance) * saturation,
        brightnessOffset,
        contrast,
        gammaExponent,
      );
      frame[offset + 1] = this.adjustChannel(
        luminance + (green - luminance) * saturation,
        brightnessOffset,
        contrast,
        gammaExponent,
      );
      frame[offset + 2] = this.adjustChannel(
        luminance + (blue - luminance) * saturation,
        brightnessOffset,
        contrast,
        gammaExponent,
      );
    }

    const adjusted = blur > 0 ? this.blur(frame, blur) : frame;
    return correctLedBuffer(
      adjusted,
      this.correction.ledBlackPoints,
      this.correction.ledLowRangeGammas,
      this.correction.ledMatchPoint,
    );
  }

  private adjustChannel(
    value: number,
    brightnessOffset: number,
    contrast: number,
    gammaExponent: number,
  ): number {
    const contrasted = (value - 127.5) * contrast + 127.5 + brightnessOffset;
    const normalized = clamp(contrasted) / 255;
    return Math.round(255 * normalized ** gammaExponent);
  }

  private blur(source: Buffer, radius: number): Buffer {
    if (this.blurBuffer.length !== source.length) {
      this.blurBuffer = Buffer.alloc(source.length);
    }
    const ledCount = Math.floor(source.length / 3);

    for (let led = 0; led < ledCount; led++) {
      const start = Math.max(0, led - radius);
      const end = Math.min(ledCount - 1, led + radius);
      const count = end - start + 1;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let neighbor = start; neighbor <= end; neighbor++) {
        const offset = neighbor * 3;
        red += source[offset];
        green += source[offset + 1];
        blue += source[offset + 2];
      }
      const offset = led * 3;
      this.blurBuffer[offset] = Math.round(red / count);
      this.blurBuffer[offset + 1] = Math.round(green / count);
      this.blurBuffer[offset + 2] = Math.round(blue / count);
    }
    return this.blurBuffer;
  }
}

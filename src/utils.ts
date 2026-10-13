export type RGB = [number, number, number];

export function clamp(value: number, minimum = 0, maximum = 255): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export class AudioNormalizer {
  private readonly averageTimeMs: number;
  private readonly noiseFloor: number;
  private readonly peakToAverageRatio: number;
  private averageLevel = 0;
  private smoothLevel = 0;
  private lastUpdateTime = 0;

  constructor(
    averageTimeMs = 3_000,
    noiseFloor = 0.003,
    peakToAverageRatio = 2.5,
  ) {
    this.averageTimeMs = averageTimeMs;
    this.noiseFloor = noiseFloor;
    this.peakToAverageRatio = peakToAverageRatio;
  }

  update(rms: number): number {
    const now = Date.now();
    if (this.lastUpdateTime === 0 || (
      this.averageLevel <= this.noiseFloor && rms > this.noiseFloor
    )) {
      this.averageLevel = rms;
    } else {
      const elapsed = now - this.lastUpdateTime;
      const alpha = 1 - Math.exp(-elapsed / this.averageTimeMs);
      this.averageLevel += (rms - this.averageLevel) * alpha;
    }
    this.lastUpdateTime = now;

    const dynamicMaximum = Math.max(
      this.noiseFloor * 2,
      this.averageLevel * this.peakToAverageRatio,
    );
    const normalized = clamp(
      (rms - this.noiseFloor) / (dynamicMaximum - this.noiseFloor),
      0,
      1,
    );
    const smoothing = normalized > this.smoothLevel ? 0.25 : 0.08;
    this.smoothLevel += (normalized - this.smoothLevel) * smoothing;
    return this.smoothLevel;
  }

  get average(): number {
    return this.averageLevel;
  }

  get smooth(): number {
    return this.smoothLevel;
  }
}

export function changeRgbSaturation(rgb: RGB, saturation: number): RGB {
  const gray = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return rgb.map((channel) => Math.round(clamp(
    gray + (channel - gray) * saturation,
  ))) as RGB;
}

export function changeRgbAbsoluteBrightness(rgb: RGB, brightness: number): RGB {
  const currentBrightness = Math.max(...rgb);
  if (currentBrightness === 0) return [0, 0, 0];
  const scale = clamp(brightness, 0, 1) * 255 / currentBrightness;
  return rgb.map((channel) => Math.round(clamp(channel * scale))) as RGB;
}

export function correctLedPixel(
  pixel: RGB,
  blackPoints: readonly [number, number, number],
  lowRangeGammas: readonly [number, number, number],
  matchPoint: number,
): RGB {
  return pixel.map((rawValue, channel) => {
    const value = clamp(rawValue);
    const blackPoint = clamp(blackPoints[channel], 0, matchPoint - 1);
    const gamma = Math.max(0.01, lowRangeGammas[channel]);
    if (value <= blackPoint) return 0;
    if (value >= matchPoint) return Math.round(value);
    const normalized = (value - blackPoint) / (matchPoint - blackPoint);
    return Math.round(matchPoint * normalized ** gamma);
  }) as RGB;
}

export function correctLedBuffer(
  data: Buffer,
  blackPoints: readonly [number, number, number],
  lowRangeGammas: readonly [number, number, number],
  matchPoint: number,
): Buffer {
  for (let offset = 0; offset + 2 < data.length; offset += 3) {
    const corrected = correctLedPixel(
      [data[offset], data[offset + 1], data[offset + 2]],
      blackPoints,
      lowRangeGammas,
      matchPoint,
    );
    data[offset] = corrected[0];
    data[offset + 1] = corrected[1];
    data[offset + 2] = corrected[2];
  }
  return data;
}

export function ledsPaletteGradient(
  colors: RGB[],
  ledCount: number,
  gradientSize: number,
): RGB[] {
  const usableColors = colors.length > 0 ? colors : [[0, 25, 255] as RGB];
  const leds = new Array<RGB>(ledCount);
  const segmentLength = ledCount / usableColors.length;

  for (let led = 0; led < ledCount; led++) {
    const colorIndex = Math.min(
      usableColors.length - 1,
      Math.floor(led * usableColors.length / ledCount),
    );
    leds[led] = [...usableColors[colorIndex]] as RGB;
  }

  if (gradientSize <= 0 || usableColors.length === 1) return leds;
  for (let boundaryIndex = 1; boundaryIndex < usableColors.length; boundaryIndex++) {
    const boundary = boundaryIndex * segmentLength;
    const start = Math.max(0, Math.ceil(boundary - gradientSize));
    const end = Math.min(ledCount - 1, Math.floor(boundary + gradientSize - 1));
    const left = usableColors[boundaryIndex - 1];
    const right = usableColors[boundaryIndex];

    for (let led = start; led <= end; led++) {
      const mix = clamp(
        (led + 0.5 - (boundary - gradientSize)) / (gradientSize * 2),
        0,
        1,
      );
      leds[led] = [
        Math.round(left[0] * (1 - mix) + right[0] * mix),
        Math.round(left[1] * (1 - mix) + right[1] * mix),
        Math.round(left[2] * (1 - mix) + right[2] * mix),
      ];
    }
  }
  return leds;
}

export function interpolateLedArrays(from: RGB[], to: RGB[], amount: number): RGB[] {
  const mix = clamp(amount, 0, 1);
  return to.map((target, index) => {
    const source = from[index] ?? target;
    return [
      Math.round(source[0] + (target[0] - source[0]) * mix),
      Math.round(source[1] + (target[1] - source[1]) * mix),
      Math.round(source[2] + (target[2] - source[2]) * mix),
    ];
  });
}

export function ledsArrayToBuffer(leds: RGB[]): Buffer {
  const buffer = Buffer.alloc(leds.length * 3);
  leds.forEach((led, index) => buffer.set(led, index * 3));
  return buffer;
}

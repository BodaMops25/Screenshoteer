import FFT from 'fft.js';

export type AudioBands = number[];

export interface AudioMeterOptions {
  onAudioUpdate?: (value: number) => void;
  onBandsUpdate?: (bands: AudioBands) => void;
  onSpectrumUpdate?: (spectrum: number[]) => void;
  bandCount?: number;
  spectrumSize?: number;
}

export class AudioMeter {
  private static readonly SAMPLE_RATE = 48_000;
  private static readonly FFT_SIZE = 2048;
  private readonly onAudioUpdate: (value: number) => void;
  private readonly onBandsUpdate: (bands: AudioBands) => void;
  private readonly onSpectrumUpdate?: (spectrum: number[]) => void;
  private frequencyAnalysisEnabled: boolean;
  private readonly spectrumSize: number;
  private readonly fft = new FFT(AudioMeter.FFT_SIZE);
  private readonly fftInput = new Array<number>(AudioMeter.FFT_SIZE).fill(0);
  private readonly fftOutput = this.fft.createComplexArray();
  private bandRanges: Array<readonly [number, number]>;
  private bandAverages: AudioBands;
  private smoothedBands: AudioBands;
  private readonly spectrumAverages: number[];
  private readonly smoothedSpectrum: number[];
  private readonly spectrumBinRanges: Array<readonly [number, number]>;
  private fftInputIndex = 0;
  private lastBandUpdate = 0;

  constructor({
    onAudioUpdate,
    onBandsUpdate,
    onSpectrumUpdate,
    bandCount = 4,
    spectrumSize = 0,
  }: AudioMeterOptions = {}) {
    this.onAudioUpdate = onAudioUpdate ?? (() => {});
    this.onBandsUpdate = onBandsUpdate ?? (() => { });
    this.onSpectrumUpdate = onSpectrumUpdate;
    this.frequencyAnalysisEnabled = Boolean(onBandsUpdate || onSpectrumUpdate);
    const normalizedBandCount = Math.max(1, Math.floor(bandCount));
    this.bandRanges = this.createLogFrequencyRanges(normalizedBandCount, 20, 12_000);
    this.bandAverages = new Array<number>(normalizedBandCount).fill(0);
    this.smoothedBands = new Array<number>(normalizedBandCount).fill(0);
    this.spectrumSize = Math.max(0, Math.floor(spectrumSize));
    this.spectrumAverages = new Array<number>(this.spectrumSize).fill(0);
    this.smoothedSpectrum = new Array<number>(this.spectrumSize).fill(0);
    const minimumFrequency = 20;
    const frequencyRatio = 20_000 / minimumFrequency;
    const binWidth = AudioMeter.SAMPLE_RATE / AudioMeter.FFT_SIZE;
    this.spectrumBinRanges = this.spectrumAverages.map((_, index) => {
      const startFrequency = minimumFrequency * Math.pow(
        frequencyRatio,
        index / this.spectrumSize,
      );
      const endFrequency = minimumFrequency * Math.pow(
        frequencyRatio,
        (index + 1) / this.spectrumSize,
      );
      const firstBin = Math.max(1, Math.floor(startFrequency / binWidth));
      const lastBin = Math.min(
        AudioMeter.FFT_SIZE / 2,
        Math.max(firstBin, Math.floor(endFrequency / binWidth)),
      );
      return [firstBin, lastBin] as const;
    });
  }

  setBandCount(count: number): void {
    const normalizedCount = Math.max(1, Math.floor(count));
    if (normalizedCount === this.bandRanges.length) return;
    this.bandRanges = this.createLogFrequencyRanges(normalizedCount, 20, 12_000);
    this.bandAverages = new Array<number>(normalizedCount).fill(0);
    this.smoothedBands = new Array<number>(normalizedCount).fill(0);
  }

  setFrequencyAnalysisEnabled(enabled: boolean): void {
    this.frequencyAnalysisEnabled = enabled;
    this.fftInputIndex = 0;
  }

  push(chunk: Buffer): void {
    let sumSquares = 0;
    let count = 0;

    // loopback-capture supplies interleaved signed 16-bit little-endian PCM.
    for (let offset = 0; offset + 3 < chunk.length; offset += 4) {
      const left = chunk.readInt16LE(offset) / 32768;
      const right = chunk.readInt16LE(offset + 2) / 32768;
      // Energy-average both channels. Unlike (left + right) / 2, this does not
      // lose level when stereo content has opposite phase.
      sumSquares += (left * left + right * right) / 2;
      count += 1;

      if (this.frequencyAnalysisEnabled) {
        this.fftInput[this.fftInputIndex] = (left + right) / 2;
        this.fftInputIndex++;

        if (this.fftInputIndex === AudioMeter.FFT_SIZE) {
          this.analyzeFrequencyBands();
          this.fftInputIndex = 0;
        }
      }
    }

    if (count > 0) this.onAudioUpdate(Math.sqrt(sumSquares / count));
  }

  private analyzeFrequencyBands(): void {
    const lastSample = AudioMeter.FFT_SIZE - 1;
    for (let i = 0; i < AudioMeter.FFT_SIZE; i++) {
      const hannWindow = 0.5 * (1 - Math.cos((2 * Math.PI * i) / lastSample));
      this.fftInput[i] *= hannWindow;
    }

    this.fft.realTransform(this.fftOutput, this.fftInput);

    const now = Date.now();
    const elapsed = this.lastBandUpdate === 0 ? 0 : now - this.lastBandUpdate;
    const averageAlpha = this.lastBandUpdate === 0
      ? 1
      : 1 - Math.exp(-elapsed / 3000);
    this.lastBandUpdate = now;

    const bands = this.bandRanges.map(([minimumHz, maximumHz], bandIndex) => {
      const firstBin = Math.max(1, Math.ceil(
        minimumHz * AudioMeter.FFT_SIZE / AudioMeter.SAMPLE_RATE,
      ));
      const lastBin = Math.min(AudioMeter.FFT_SIZE / 2, Math.floor(
        maximumHz * AudioMeter.FFT_SIZE / AudioMeter.SAMPLE_RATE,
      ));

      let energy = 0;
      let binCount = 0;
      for (let bin = firstBin; bin <= lastBin; bin++) {
        const real = this.fftOutput[bin * 2];
        const imaginary = this.fftOutput[bin * 2 + 1];
        energy += real * real + imaginary * imaginary;
        binCount++;
      }

      const bandRms = Math.sqrt(energy / Math.max(1, binCount)) / AudioMeter.FFT_SIZE;
      this.bandAverages[bandIndex] += (
        bandRms - this.bandAverages[bandIndex]
      ) * averageAlpha;

      const noiseFloor = 0.00001;
      const dynamicMaximum = Math.max(
        noiseFloor * 2,
        this.bandAverages[bandIndex] * 1.5,
      );
      const originalNormalized = Math.min(1, Math.max(
        0,
        (bandRms - noiseFloor) / (dynamicMaximum - noiseFloor),
      ));

      const normalized = Math.pow(originalNormalized, 2);

      const smoothing = normalized > this.smoothedBands[bandIndex] ? 0.35 : 0.12;
      this.smoothedBands[bandIndex] += (
        normalized - this.smoothedBands[bandIndex]
      ) * smoothing;

      return this.smoothedBands[bandIndex];
    });

    this.onBandsUpdate(bands);

    if (this.onSpectrumUpdate && this.spectrumSize > 0) {
      const spectrum = this.spectrumAverages.map((average, index) => {
        const [firstBin, lastBin] = this.spectrumBinRanges[index];

        let energy = 0;
        let binCount = 0;
        for (let bin = firstBin; bin <= lastBin; bin++) {
          const real = this.fftOutput[bin * 2];
          const imaginary = this.fftOutput[bin * 2 + 1];
          energy += real * real + imaginary * imaginary;
          binCount++;
        }

        const spectrumRms = Math.sqrt(energy / Math.max(1, binCount))
          / AudioMeter.FFT_SIZE;
        this.spectrumAverages[index] = average
          + (spectrumRms - average) * averageAlpha;

        const noiseFloor = 0.00001;
        const dynamicMaximum = Math.max(
          noiseFloor * 2,
          this.spectrumAverages[index] * 1.5,
        );
        const normalized = Math.min(1, Math.max(
          0,
          (spectrumRms - noiseFloor) / (dynamicMaximum - noiseFloor),
        ));
        const smoothing = normalized > this.smoothedSpectrum[index] ? 0.35 : 0.12;
        this.smoothedSpectrum[index] += (
          normalized - this.smoothedSpectrum[index]
        ) * smoothing;

        return this.smoothedSpectrum[index];
      });

      this.onSpectrumUpdate(spectrum);
    }
  }

  private createLogFrequencyRanges(
    count: number,
    minimumHz: number,
    maximumHz: number,
  ): Array<readonly [number, number]> {
    const ratio = maximumHz / minimumHz;
    return Array.from({ length: count }, (_, index) => [
      minimumHz * ratio ** (index / count),
      minimumHz * ratio ** ((index + 1) / count),
    ] as const);
  }
}

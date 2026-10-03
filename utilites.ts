export type RGB = [number, number, number]

const AVERAGE_TIME_MS = 3000;
const NOISE_FLOOR = 0.003;
const PEAK_TO_AVERAGE_RATIO = 2.5;

let averageLevel = 0;
let smoothLevel = 0;
let lastUpdateTime = 0;

export function getAudioLevels() {
  return {
    average: averageLevel,
    smooth: smoothLevel,
  }
}

export function audioToBrightness(rms: number): number {
  const now = Date.now();

  if (lastUpdateTime === 0 || (averageLevel <= NOISE_FLOOR && rms > NOISE_FLOOR)) {
    averageLevel = rms;
  } else {
    const elapsed = now - lastUpdateTime;
    const averageAlpha = 1 - Math.exp(-elapsed / AVERAGE_TIME_MS);
    averageLevel += (rms - averageLevel) * averageAlpha;
  }
  lastUpdateTime = now;

  const dynamicMaximum = Math.max(
    NOISE_FLOOR * 2,
    averageLevel * PEAK_TO_AVERAGE_RATIO,
  );

  const normalized = Math.min(1, Math.max(
    0,
    (rms - NOISE_FLOOR) / (dynamicMaximum - NOISE_FLOOR),
  ));

  const smoothing = normalized > smoothLevel ? 0.25 : 0.08;
  smoothLevel += (normalized - smoothLevel) * smoothing;

  return smoothLevel;
}

export function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? 255 : value
}

export function changeOnePixelInSeq(pixels_seq: number[] | Buffer<ArrayBufferLike>, pixel_num: number, callback: (pixel: RGB) => RGB) {
  const new_pixel = callback([
    pixels_seq[pixel_num * 3],
    pixels_seq[pixel_num * 3 + 1],
    pixels_seq[pixel_num * 3 + 2]
  ])

  pixels_seq[pixel_num * 3] = new_pixel[0]
  pixels_seq[pixel_num * 3 + 1] = new_pixel[1]
  pixels_seq[pixel_num * 3 + 2] = new_pixel[2]
}

export function changeManyPixelsInSeq(pixels_seq: number[] | Buffer<ArrayBufferLike>, callback: (pixel: RGB) => RGB) {
  for (let i = 0; i < pixels_seq.length / 3; i++) {
    changeOnePixelInSeq(pixels_seq, i, callback)
  }
}

export function rgb2hsv([r, g, b]: RGB) {

  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min

  let h = 0, s = 0, v = max;
  s = max === 0 ? 0 : d / max

  if (max === min) h = 0
  else {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }

    h /= 6
  }

  h = Math.round(h * 255)
  s = Math.round(s * 255)
  v = Math.round(v * 255)

  return [h, s, 0 < v ? v : 0]
}

export function hsv2rgb([h, s, v]: RGB) {
  h = h / 255
  s = s / 255
  v = v / 255

  let r = 0, g = 0, b = 0;

  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ]
}

export function rgbGammaCorrection([r, g, b]: RGB, gamma = 2.2) {
  const correctionFunc = (v: number) => Math.round(Math.pow(v / 255, 1 / gamma) * 255)

  return [
    correctionFunc(r),
    correctionFunc(g),
    correctionFunc(b)
  ]
}

export function rgbBrightnessCorrection(pixel: RGB, brightness = 1) {
  pixel[0] = clamp(Math.round(pixel[0] * brightness), 0, 255)
  pixel[1] = clamp(Math.round(pixel[1] * brightness), 0, 255)
  pixel[2] = clamp(Math.round(pixel[2] * brightness), 0, 255)
}

export function rgbLedStripCorrection(
  pixel: RGB,
  blackPoints: readonly [number, number, number] = [8, 8, 8],
  lowRangeGammas: readonly [number, number, number] = [1.5, 1.5, 1.5],
  matchPoint = 128,
) {
  for (let channel = 0; channel < 3; channel++) {
    const value = Math.max(0, Math.min(255, pixel[channel]))
    const blackPoint = Math.max(0, Math.min(matchPoint - 1, blackPoints[channel]))
    const gamma = Math.max(0.01, lowRangeGammas[channel])

    if (value <= blackPoint) {
      pixel[channel] = 0
    } else if (value < matchPoint) {
      const normalized = (value - blackPoint) / (matchPoint - blackPoint)
      pixel[channel] = Math.round(matchPoint * normalized ** gamma)
    } else {
      pixel[channel] = Math.round(value)
    }
  }

  return pixel
}

export function rgbContrastCorrection(pixel: RGB, contrast = 1) {
  const midpoint = 128

  const correctionFunc = (v: number) => {
    const c = (v - midpoint) * contrast + midpoint
    return Math.max(0, Math.min(255, Math.round(c)))
  }

  pixel[0] = correctionFunc(pixel[0])
  pixel[1] = correctionFunc(pixel[1])
  pixel[2] = correctionFunc(pixel[2])
}

export function rgbLuminance([r, g, b]: RGB) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// [[r,g,b],[r,g,b]]
export function rgbBlendAvarage(pixelsArray: RGB[]) {

  const [r, g, b] = pixelsArray.reduce(([sum_r, sum_g, sum_b], [r, g, b]) => {
    return [sum_r + r, sum_g + g, sum_b + b]
  }, [0, 0, 0])

  return [Math.round(r / pixelsArray.length), Math.round(g / pixelsArray.length), Math.round(b / pixelsArray.length)]
}

export function rgbBlendAvarageLessDarker(pixelsArray: RGB[]) {

  const [rSum, gSum, bSum, wSum] = pixelsArray.reduce(([sum_r, sum_g, sum_b, weights], pixel) => {
    const weight = rgbLuminance(pixel)

    return [
      sum_r + pixel[0] * weight,
      sum_g + pixel[1] * weight,
      sum_b + pixel[2] * weight,
      weights + weight
    ]
  }, [0, 0, 0, 0])

  if (wSum === 0) return [0, 0, 0]

  return [
    Math.round(rSum / wSum),
    Math.round(gSum / wSum),
    Math.round(bSum / wSum)
  ]
}

export function rgbBlendAvarageLessDarkerLighter(pixelsArray: RGB[], impact = 2) {

  const [rSum, gSum, bSum, wSum] = pixelsArray.reduce(([sum_r, sum_g, sum_b, weights], pixel) => {
    const l = rgbLuminance(pixel)
    const weight = 1 - impact * Math.abs(l - .5)
    // const weight = 1 - (2*Math.abs(l - .5))**2

    return [
      sum_r + pixel[0] * weight,
      sum_g + pixel[1] * weight,
      sum_b + pixel[2] * weight,
      weights + weight
    ]
  }, [0, 0, 0, 0])

  if (wSum === 0) return [0, 0, 0]

  return [
    Math.round(rSum / wSum),
    Math.round(gSum / wSum),
    Math.round(bSum / wSum)
  ]
}

export function rgbBlendAdditive(pixelsArray: RGB[]) {
  const [r, g, b] = pixelsArray.reduce(([sum_r, sum_g, sum_b], [r, g, b]) => {
    return [sum_r + r, sum_g + g, sum_b + b]
  }, [0, 0, 0])

  return [Math.round(r < 255 ? r : 255), Math.round(g < 255 ? g : 255), Math.round(b < 255 ? b : 255)]
}

export function rgbBlendMultiplicative(pixelsArray: RGB[]) {
  const [r, g, b] = pixelsArray.reduce(([sum_r, sum_g, sum_b], [r, g, b]) => {
    return [sum_r * r, sum_g * g, sum_b * b]
  }, [1, 1, 1])

  return [Math.round(r / pixelsArray.length), Math.round(g / pixelsArray.length), Math.round(b / pixelsArray.length)]
}

export function rgbBlur(pixels: RGB[]) {
  const pixelBluring = (index: number) => {
    pixels[index][0] = Math.round((pixels[index][0] * 2 + pixels[index - 1][0] + pixels[index + 1][0]) / 4)
    pixels[index][1] = Math.round((pixels[index][1] * 2 + pixels[index - 1][1] + pixels[index + 1][1]) / 4)
    pixels[index][2] = Math.round((pixels[index][2] * 2 + pixels[index - 1][2] + pixels[index + 1][2]) / 4)
  }

  pixels.forEach((pixel, index, arr) => {
    if (arr[index - 1] === undefined || arr[index + 1] === undefined) return
    pixelBluring(index)
  })
}

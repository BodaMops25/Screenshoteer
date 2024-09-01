export function blendColors(colorArray) {
  const [r, g, b] = colorArray.reduce(([sum_r, sum_g, sum_b], [r, g, b]) => {
                      return [sum_r + r, sum_g + g, sum_b + b]
                    }, [0, 0, 0])

  return [Math.round(r / colorArray.length), Math.round(g / colorArray.length), Math.round(b / colorArray.length)]
}

export function rgb2hsv(r, g, b) {

  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min

  let h = 0, s = 0, v = max;
  s = max === 0 ? 0 : d / max

  if(max === min) h = 0
  else {
    switch(max) {
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

  return [
    Math.round(h * 255),
    Math.round(s * 255),
    Math.round(v * 255)
  ]
}

export function getPixelFromSeq(width, dataSeq, channels, x, y) {
  const dataIndex = y * width * channels + x * channels
  return [
    dataSeq[dataIndex],
    dataSeq[dataIndex+1],
    dataSeq[dataIndex+2]
  ]
}
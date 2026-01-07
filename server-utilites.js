import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import { rgb2hsv } from './utilites.js';
import spawn from 'cross-spawn'

export function getPixelFromSeq(width, dataSeq, channels, x, y) {
  const dataIndex = y * width * channels + x * channels
  return [
    dataSeq[dataIndex],
    dataSeq[dataIndex+1],
    dataSeq[dataIndex+2]
  ]
}

export function getLEDsFromScreenHSV({
  displayId,
  displaySamples_x,
  displaySamples_y,
  pixelProcessingFunc,
  blendPixelsFunc,
  postProcessingFunc
}) {

  return new Promise((res, rej) => {

    screenshot({screen: displayId})
    .then(imgBuff => {

      sharp(imgBuff)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => {
          const { width, height, channels } = info,
                step_y = height / (displaySamples_y + 1),
                step_x = width / (displaySamples_x + 1),
                ledSeq2Send = []

          for(let j = 1; j <= displaySamples_x; j++) {
            const x = Math.round(j * step_x),
                  tmp_rgb_arr = []
            
            for(let i = 1; i <= displaySamples_y; i++) {
              const y = Math.round(i * step_y)

              let pixel = getPixelFromSeq(width, data, channels, x, y)

              if(pixelProcessingFunc) pixelProcessingFunc(pixel)

              tmp_rgb_arr.push(pixel)
            }

            let blendedPixel = blendPixelsFunc(tmp_rgb_arr)

            if(postProcessingFunc) postProcessingFunc(blendedPixel)

            ledSeq2Send.push(
              rgb2hsv(blendedPixel)
            )
          }

          res(ledSeq2Send)
        })
    })
  })
}

export function createLEDSeqFlowHSV({
  ledNum,
  framerate,
  onRawRGBData
}) {
  const imgSize = ledNum * 3
  const ffmpeg_process = spawn(
    'ffmpeg',
    [
      "-fflags", "nobuffer",
      "-flags", "low_delay",
      "-framerate", framerate,
      "-f", "gdigrab",
      "-video_size", "2560x1440",
      "-i", "desktop",
      '-vf', `scale=${ledNum}:1:flags=area`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-"
    ],
    {stdio: 'pipe'}
  )
  let imgBuffs = []
  let dataLength = 0

  ffmpeg_process.stdout.on('data', (chunck) => {
    imgBuffs.push(chunck)
    dataLength += chunck.length

    if(dataLength >= imgSize) {

      const data = Buffer.concat(imgBuffs).subarray(0, imgSize)

      if(onRawRGBData) onRawRGBData(data)

      imgBuffs = []
      dataLength = 0
    }
  })
}
import { createLEDSeqFlow, WLEDDdp } from './server-utilites.ts';
import { changeManyPixelsInSeq, rgbBrightnessCorrection, audioToBrightness } from './utilites.ts';
import loopbackCapture from 'loopback-capture';
const { LoopbackCapture } = loopbackCapture;

// LEDS EXTRACTION

const DEBUG_MDDE = true,
  AVARAGE_ARR_MAX = 100,
  DEBUG_LOGS_INTERVAL = 10

const avarageArr: number[] = []
let avarageArrIndex = 0
let timemark = +new Date()
let audioLevelRaw = 0

const targetHost = '192.168.1.18';
const targetPort = 4048;
const socket = new WLEDDdp(targetHost, targetPort);

const capture = new LoopbackCapture();

capture.startSystemAudio((chunk) => {

  let sumSquares = 0;
  let count = 0;

  for (let offset = 0; offset + 3 < chunk.length; offset += 4) {
    const left = chunk.readInt16LE(offset) / 32768;
    const right = chunk.readInt16LE(offset + 2) / 32768;
    sumSquares += (left * left + right * right) / 2;
    count += 1;
  }

  audioLevelRaw = Math.sqrt(sumSquares / count)
});

(async () => {
  await socket.initLeds()
  const selectedSegment = socket.jsonClient.state.segments.find(s => s.selected)
  if (!selectedSegment) {
    console.error('Not selected WLED strip segment')
    return
  }
  const ledsOffset = selectedSegment.start
  const ledsCount = selectedSegment.length

  createLEDSeqFlow({
    framerate: 60,
    ledNum: ledsCount,
    onRawRGBData: (color_seq) => {

      const brightnessLevel = audioToBrightness(audioLevelRaw)

      /* changeManyPixelsInSeq(color_seq, (pixel) => {
        const tmp = pixel[0]
        pixel[0] = pixel[2]
        pixel[2] = tmp
        return pixel
      }) */

      changeManyPixelsInSeq(color_seq, (pixel) => {
        rgbBrightnessCorrection(pixel, brightnessLevel)
        return pixel
      })

      socket.sendRaw(color_seq, ledsOffset * 3)

      if (DEBUG_MDDE) {



        avarageArr[avarageArrIndex++] = +new Date() - timemark
        timemark = +new Date()
        if (avarageArrIndex % DEBUG_LOGS_INTERVAL === 0) {
          console.log(
            'MS: %s, Clients: %d, Time: %s',
            Math.round(avarageArr.reduce((sum, num) => sum + num, 0) / avarageArr.length).toString().padStart(4, '0'),
            0,
            new Date().toISOString()
          )
        }

        if (avarageArrIndex >= AVARAGE_ARR_MAX) avarageArrIndex = 0
      }
    }
  })
})()

process.once("SIGINT", () => {
  capture.stop()
  process.exit(0)
})

process.once("SIGTERM", () => {
  capture.stop()
  process.exit(0)
})
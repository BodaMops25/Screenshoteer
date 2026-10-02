import { WebSocket } from 'ws';
import { createLEDSeqFlow, WLEDDdp } from './server-utilites.ts';
import { changeManyPixelsInSeq, rgbBrightnessCorrection, audioToBrightness } from './utilites.ts';
import {
  DEBUG_MDDE,
  DEBUG_NO_WLED,
  DEBUG_LED_COUNT,
  TIMEOUT_TO_SET_NO_MUSIC_MS,
  DEBUG_LOGS_INTERVAL,
  WLED_PORT,
  WLED_HOST,
  FPS,
  DEBUG_WS_SIMULATION,
  DEBUG_LOGS
} from './config.ts';
import loopbackCapture from 'loopback-capture';
const { LoopbackCapture } = loopbackCapture;

if (process.platform !== 'win32') {
  throw new Error('This collector currently supports Windows only');
}

const capture = new LoopbackCapture()
const socket = new WLEDDdp(WLED_HOST, WLED_PORT);

(async () => {

  const AVARAGE_ARR_MAX = 100

  const avarageArr: number[] = []
  let avarageArrIndex = 0
  let timemark = +new Date()

  let audioLevelRaw = 0
  let lastAudioChunkDate = 0

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
    lastAudioChunkDate = Date.now()
  });

  let ledsOffset, ledsCount

  if (!DEBUG_NO_WLED) {

    try {
      await socket.initLeds()
    }
    catch (err) {
      throw new Error('WLED device not found')
    }

    const selectedSegment = socket.jsonClient.state.segments.find(s => s.selected)
    if (!selectedSegment) {
      console.error('Not selected WLED strip segment')
      return
    }
    ledsOffset = selectedSegment.start
    ledsCount = selectedSegment.length
  } else {
    ledsOffset = 0
    ledsCount = DEBUG_LED_COUNT
  }

  let simulation_client: any | undefined

  if (DEBUG_WS_SIMULATION) {
    const wss = new WebSocket.Server({ port: 8080 })
    wss.on('connection', (client: any) => {
      simulation_client = client
      console.log('simulation client changed')
    })
  }

  createLEDSeqFlow({
    framerate: FPS,
    ledNum: ledsCount,
    onRawRGBData: (color_seq) => {

      let brightnessLevel = 1

      if (Date.now() - lastAudioChunkDate > TIMEOUT_TO_SET_NO_MUSIC_MS) {
        brightnessLevel = .3 * Math.sin(Math.round(performance.now()) / 500) + .7
      } else {
        brightnessLevel = audioToBrightness(audioLevelRaw)
      }

      changeManyPixelsInSeq(color_seq, (pixel) => {
        rgbBrightnessCorrection(pixel, brightnessLevel)
        return pixel
      })

      if (!DEBUG_NO_WLED) socket.sendRaw(color_seq, ledsOffset * 3)
      if (DEBUG_WS_SIMULATION && simulation_client) simulation_client.send(color_seq)
      if (DEBUG_LOGS) {

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
import { WebSocket } from 'ws';
import { CmdLogs, createLEDSeqFlow, WLEDDdp } from './server-utilites.ts';
import { changeManyPixelsInSeq, rgbBrightnessCorrection, rgbLedStripCorrection, audioToBrightness, getAudioLevels } from './utilites.ts';
import {
  DEBUG_NO_WLED,
  TIMEOUT_TO_SET_NO_MUSIC_MS,
  DEBUG_LED_COUNT,
  WLED_PORT,
  WLED_HOST,
  FPS,
  DEBUG_WS_SIMULATION,
  DEBUG_LOGS,
  LED_BLACK_POINTS,
  LED_LOW_RANGE_GAMMAS,
  LED_MATCH_POINT
} from './config.ts';
import loopbackCapture from 'loopback-capture';
const { LoopbackCapture } = loopbackCapture;

if (process.platform !== 'win32') {
  throw new Error('This collector currently supports Windows only');
}

const capture = new LoopbackCapture()
const socket = new WLEDDdp(WLED_HOST, WLED_PORT);
const logs = new CmdLogs(250, DEBUG_LOGS);

(async () => {

  let audioLevelRaw = 0
  let lastAudioChunkDate = 0
  let lastFrameTime: number | undefined

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

  logs.set('LEDs', ledsCount)

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
      const now = performance.now()
      const averageSendMs = lastFrameTime === undefined
        ? 0
        : logs.sample('Average send ms', now - lastFrameTime)
      lastFrameTime = now
      const audioPlaying = Date.now() - lastAudioChunkDate <= TIMEOUT_TO_SET_NO_MUSIC_MS
      const audioBrightness = audioToBrightness(audioPlaying ? audioLevelRaw : 0)
      let brightnessLevel = 1

      if (!audioPlaying) {
        brightnessLevel = .3 * Math.sin(Math.round(performance.now()) / 500) + .7
      } else {
        brightnessLevel = audioBrightness
      }

      const audioLevels = getAudioLevels()

      logs.set('Time', new Date().toLocaleTimeString())
      logs.set('Raw audio', audioPlaying ? audioLevelRaw : 0)
      logs.set('Average audio', audioLevels.average)
      logs.set('Smooth audio', audioLevels.smooth)
      logs.set('Audio playing', audioPlaying)
      logs.set('Framerate', averageSendMs > 0 ? 1000 / averageSendMs : 0)

      changeManyPixelsInSeq(color_seq, (pixel) => {
        rgbBrightnessCorrection(pixel, brightnessLevel)
        rgbLedStripCorrection(pixel, LED_BLACK_POINTS, LED_LOW_RANGE_GAMMAS, LED_MATCH_POINT)
        return pixel
      })

      if (!DEBUG_NO_WLED) socket.sendRaw(color_seq, ledsOffset * 3)
      if (DEBUG_WS_SIMULATION && simulation_client) simulation_client.send(color_seq)
    }
  })
})()

process.once("SIGINT", () => {
  logs.stop()
  capture.stop()
  process.exit(0)
})

process.once("SIGTERM", () => {
  logs.stop()
  capture.stop()
  process.exit(0)
})

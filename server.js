import express from 'express'
import { WebSocketServer } from 'ws';
import { rgbGammaCorrection, rgbContrastCorrection, rgbBrightnessCorrection, rgbBlendAvarage, rgbBlendAvarageLessDarker, rgbBlendAvarageLessDarkerLighter, rgbBlur, clamp, rgb2hsv } from './utilites.js';
import http from 'http'
import { getLEDsFromScreenHSV, createLEDSeqFlowHSV } from './server-utilites.js';

const HTTP_PORT = 80
const WS_PORT = 8080

// EXPRESS SERVER

const app = express()
app.use(express.static("."));

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`Express server running at http://0.0.0.0:${HTTP_PORT}/`)
})

// WS SERVER

const server = http.createServer(app)
const wss = new WebSocketServer({server})
const wsClients = [];

wss.on('connection', ws => {
  console.log('client join')
  // ws.send('Oh hi!')

  wsClients.push(ws)

  ws.on('message', (msg) => {
    console.log('message from client:', msg)
  })

  ws.on('close', () => {
    const i = wsClients.findIndex(v => v === ws)
    wsClients.splice(i, 1)
    console.log('client leave')
  })
})

server.listen(WS_PORT, '0.0.0.0', () => {
    console.log(`WS Server running on http://0.0.0.0:${WS_PORT}`);
});

// LEDS EXTRACTION

const displayId = '\\\\.\\DISPLAY1',
      esp32Ip = '192.168.1.20',
      portComponentId = 'txt_led_sequence',
      displaySamples_x = 292,
      displaySamples_y = 1440

const LOGS = true,
      AVARAGE_ARR_MAX = 100,
      INTERVAL_MS = 100
      
const avarageArr = []
let avarageArrIndex = 0
let timemark = +new Date()
/* const theLoop = setInterval(async () => {
  
  const leds = await getLEDsFromScreen({
    displayId, displaySamples_x, displaySamples_y,
    pixelProcessingFunc: (pixel) => {
      // rgbBrightnessCorrection(pixel, 2)
      rgbContrastCorrection(pixel, 1.4)
      // rgbGammaCorrection(pixel, 1)
    },
    blendPixelsFunc: (pixels2blend) => {
      return rgbBlendAvarageLessDarkerLighter(pixels2blend, 1)
    },
    postProcessingFunc: (pixel) => rgbBrightnessCorrection(pixel, 1.4)
  })

  rgbBlur(leds)
  rgbBlur(leds)
  rgbBlur(leds)

  wsClients.forEach(ws => ws.send(
    leds.map(led => led.join(',')).join(';')
  ))

  // const ledSeq2Send = leds.map(led => led.join(',')).join(';')
  // try {
  //   await fetch('http://' + esp32Ip + '/GP_click?' + portComponentId + '=' + ledSeq2Send.join(';'), {method: 'POST'})
  // } catch(err) {
  //   console.error('Error while sending LED seq', err)
  //   // clearInterval(theLoop)
  //   return
  // }
    
  if(LOGS) {
    avarageArr[avarageArrIndex++] = new Date() - timemark
    timemark = +new Date()

    if(avarageArrIndex % 20 === 0) {
      console.log(
        avarageArr.reduce((sum, num) => sum + num, 0) / avarageArr.length
      )
    }

    if(avarageArrIndex >= AVARAGE_ARR_MAX) avarageArrIndex = 0
  }
}, INTERVAL_MS) */

createLEDSeqFlowHSV({
  framerate: 60,
  ledNum: 298, 
  onRawRGBData: (color_seq) => {

    for(let i = 0; i < color_seq.length; i += 3) {
      const rgb_pixel = [
        color_seq[i],
        color_seq[i+1],
        color_seq[i+2]
      ]

      rgbBrightnessCorrection(rgb_pixel, 1.4)
      rgbContrastCorrection(rgb_pixel, 1.6)
      
      const rgb2hsv2seq_pixel = rgb2hsv(rgb_pixel)

      color_seq[i] = rgb2hsv2seq_pixel[0]
      color_seq[i+1] = rgb2hsv2seq_pixel[1]
      color_seq[i+2] = rgb2hsv2seq_pixel[2] < 5 ? 0 : rgb2hsv2seq_pixel[2]
    }

    wsClients.forEach(ws => ws.send(color_seq))

    if(LOGS) {
      avarageArr[avarageArrIndex++] = new Date() - timemark
      timemark = +new Date()
      if(avarageArrIndex % 1 === 0) {
        console.log(
          'MS: %s, Clients: %d, Time: %s',
          Math.round(avarageArr.reduce((sum, num) => sum + num, 0) / avarageArr.length).toString().padStart(4, '0'),
          wsClients.length,
          new Date().toISOString()
        )
      }

      if(avarageArrIndex >= AVARAGE_ARR_MAX) avarageArrIndex = 0
    }
  }
})
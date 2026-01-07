import express from 'express'
import { WebSocketServer } from 'ws';
import { rgbGammaCorrection, rgbContrastCorrection, rgbBrightnessCorrection, rgbBlendAvarage, rgbBlendAvarageLessDarker, rgbBlendAvarageLessDarkerLighter, rgbBlur, clamp, rgb2hsv } from './utilites.js';
import http from 'http'
import { createLEDSeqFlowHSV } from './server-utilites.js';

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

  wsClients.push(ws)

  ws.on('close', () => {
    const i = wsClients.findIndex(v => v === ws)
    wsClients.splice(i, 1)
  })
})

server.listen(WS_PORT, '0.0.0.0', () => {
    console.log(`WS Server running on http://0.0.0.0:${WS_PORT}`);
});

// LEDS EXTRACTION

const LOGS = true,
      AVARAGE_ARR_MAX = 100,
      INTERVAL = 10
      
const avarageArr = []
let avarageArrIndex = 0
let timemark = +new Date()

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
      if(avarageArrIndex % INTERVAL === 0) {
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
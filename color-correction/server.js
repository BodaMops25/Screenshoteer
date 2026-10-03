import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { WLEDDdp } from '../server-utilites.ts'

// Change these values for your WLED installation.
const LED_COUNT = 720
const LED_OFFSET = 0
const WLED_HOST = '192.168.1.18'
const WLED_PORT = 4048
const APP_PORT = 8081

const indexPath = fileURLToPath(new URL('./index.html', import.meta.url))
const wled = new WLEDDdp(WLED_HOST, WLED_PORT)
let currentColor = null

function sendSolidColor(red, green, blue) {
  const data = Buffer.alloc(LED_COUNT * 3)

  for (let offset = 0; offset < data.length; offset += 3) {
    data[offset] = red
    data[offset + 1] = green
    data[offset + 2] = blue
  }

  wled.sendRaw(data, LED_OFFSET * 3)
}

function isChannel(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

const server = createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  createReadStream(indexPath).pipe(response)
})

const webSockets = new WebSocketServer({ server })

webSockets.on('connection', (client) => {
  client.on('message', (message) => {
    try {
      const { red, green, blue } = JSON.parse(message.toString())

      if (![red, green, blue].every(isChannel)) {
        throw new Error('RGB channels must be integers from 0 to 255')
      }

      currentColor = [red, green, blue]
      sendSolidColor(red, green, blue)
    } catch (error) {
      client.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Invalid color',
      }))
    }
  })
})

setInterval(() => {
  if (currentColor) sendSolidColor(...currentColor)
}, 250)

server.listen(APP_PORT, '0.0.0.0', () => {
  console.log(`Color correction: http://localhost:${APP_PORT}`)
  console.log(`Sending ${LED_COUNT} LEDs to ${WLED_HOST}:${WLED_PORT}`)
})

wled.initLeds().catch((error) => {
  console.warn('Could not initialize WLED; DDP colors will still be sent:', error)
})

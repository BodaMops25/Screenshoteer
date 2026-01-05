import http from 'http'
import { WebSocketServer } from 'ws';

const WS_PORT = 8080

const server = http.createServer((req) => console.log('REQ: ', req))
const wss = new WebSocketServer({server})

let wsClient;

wss.on('connection', ws => {
  console.log('client join')

  ws.on('message', (msg) => {
    try {
      msg = JSON.parse(msg)
    } catch(err) {}

    console.log('message from client:', msg)
  })
  ws.on('close', () => console.log('client leave'))

  wsClient = ws
  // ws.send(JSON.stringify('Oh hi!'))
})

server.listen(WS_PORT, '0.0.0.0', () => {
    console.log(`WS Server running on ws://0.0.0.0:${WS_PORT}`);
});

const led_am = 292
let indx = 0

let dt = +new Date()
setInterval(() => {
  if(wsClient) {
    // wsClient.send(JSON.stringify('data string'))
    let leds_str = ''

    for(let i = 0; i < led_am; i++) {
      // leds_str +=  (i + indx) % 255 + ',255,255;'
      // leds_str += '150,255,255;'

      // if(i === indx % led_am) leds_str += '0,255,255;'
      // else leds_str += '0,0,0;'

      leds_str += `0,255,255;`
    }

    wsClient.send(leds_str)
    indx++
  }

  console.log(new Date() - dt)
  dt = +new Date()
// }, 100)
}, 16)
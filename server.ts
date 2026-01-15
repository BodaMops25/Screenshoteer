import { createLEDSeqFlow, WLEDDdp } from './server-utilites.ts';
import { changeManyPixelsInSeq } from './utilites.ts';

// LEDS EXTRACTION

const LOGS = false,
      AVARAGE_ARR_MAX = 100,
      INTERVAL = 10
      
const avarageArr: number[] = []
let avarageArrIndex = 0
let timemark = +new Date()

const targetHost = '192.168.1.3';
const targetPort = 4048;
const socket = new WLEDDdp(targetHost, targetPort);

(async () => {
  await socket.initLeds()
  const ledsCount = socket.getClientInfo().leds.count

  createLEDSeqFlow({
    framerate: 60,
    ledNum: ledsCount, 
    onRawRGBData: (color_seq) => {

      changeManyPixelsInSeq(color_seq, (pixel) => {
        const tmp = pixel[0]
        pixel[0] = pixel[2]
        pixel[2] = tmp

        return pixel
      })

      color_seq.reverse()
      socket.sendRaw(color_seq)

      if(LOGS) {
        avarageArr[avarageArrIndex++] = +new Date()- timemark
        timemark = +new Date()
        if(avarageArrIndex % INTERVAL === 0) {
          console.log(
            'MS: %s, Clients: %d, Time: %s',
            Math.round(avarageArr.reduce((sum, num) => sum + num, 0) / avarageArr.length).toString().padStart(4, '0'),
            new Date().toISOString()
          )
        }

        if(avarageArrIndex >= AVARAGE_ARR_MAX) avarageArrIndex = 0
      }
    }
  })
})()
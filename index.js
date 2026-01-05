import {rgb2hsv, blendColors} from './utilites.js'
import screenshot from 'screenshot-desktop'
import sharp from 'sharp'

const displayId = '\\\\.\\DISPLAY1',
      esp32Ip = '192.168.1.20',
      portComponentId = 'txt_led_sequence',
      displaySamples_x = 292,
      displaySamples_y = 900

const LOGS = false,
      FETCH_INTERVAL_MS = 100

function getPixelFromSeq(width, dataSeq, channels, x, y) {
  const dataIndex = y * width * channels + x * channels
  return [
    dataSeq[dataIndex],
    dataSeq[dataIndex+1],
    dataSeq[dataIndex+2]
  ]
}

function setLeds() {

  return new Promise((res, rej) => {

    screenshot({screen: displayId})
    .then(imgBuff => {

      sharp(imgBuff)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => {
          const { width, height, channels } = info,
                step_y = Math.floor(height / (displaySamples_y + 1)),
                step_x = Math.floor(width / (displaySamples_x + 1)),
                ledSeq2Send = []

          for(let j = 1; j <= displaySamples_x; j++) {
            const x = j * step_x,
                  tmp_arr = []
            
            for(let i = 1; i <= displaySamples_y; i++) {
              const y = i * step_y,
                    pixel = getPixelFromSeq(width, data, channels, x, y)

              tmp_arr.push(rgb2hsv(...pixel))
            }

            ledSeq2Send.push(blendColors(tmp_arr).join(','))
          }

          fetch('http://' + esp32Ip + '/GP_click?' + portComponentId + '=' + ledSeq2Send.join(';'), {method: 'POST'})
            .then(() => res(ledSeq2Send))
            .catch(err => {
              if(LOGS) console.warn('Error while sending LED seq')
              rej(err)
            })
        })
    })
  })
}

let fetchAllowed = true,
    start = +new Date()

setInterval(() => {
  if(fetchAllowed) {
    fetchAllowed = false
    setLeds()
      .then(data => {
        if(LOGS) console.log('LED Seq Sended')
        // console.log(data)
      })
      .catch(() => {})
      .finally(() => {
        fetchAllowed = true
        if(LOGS) {
          console.log(new Date() - start)
          start = new Date()
        }
      })
  }
}, FETCH_INTERVAL_MS)
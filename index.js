import spawn from 'cross-spawn'
import { blendColors, rgb2hsv, getPixelFromSeq } from './functions.js'

const DEFINES = {
  displayId: '\\\\.\\DISPLAY1',
  esp32Ip: '192.168.1.15',
  portComponentId: 'txt_led_sequence',
  display_width: 1366,
  display_height: 768,
  channels: 4,
  displaySamples_x: 292,
  displaySamples_y: 100,
  framerate: 10,

  LOGS: false
}
DEFINES.imgSize = DEFINES.display_width * DEFINES.display_height * DEFINES.channels

const ffmpeg_process = spawn('ffmpeg', ["-framerate", DEFINES.framerate, "-f", "x11grab", "-i", ":0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {stdio: 'pipe'})

let imgBuffs = [],
    dataLength = 0,
    fetchAllowed = true,
    start = +new Date()

ffmpeg_process.stdout.on('data', (chunck) => {
  // console.log(chunck)
  imgBuffs.push(chunck)
  dataLength += chunck.length

  if(dataLength >= DEFINES.imgSize) {
    const data = Buffer.concat(imgBuffs),
          step_y = Math.floor(DEFINES.display_height / (DEFINES.displaySamples_y + 1)),
          step_x = Math.floor(DEFINES.display_width / (DEFINES.displaySamples_x + 1)),
          ledSeq2Send = []

    for(let j = 1; j <= DEFINES.displaySamples_x; j++) {
      const x = j * step_x,
            tmp_arr = []
      
      for(let i = 1; i <= DEFINES.displaySamples_y; i++) {
        const y = i * step_y,
              pixel = getPixelFromSeq(DEFINES.display_width, data, DEFINES.channels, x, y)

        tmp_arr.push(rgb2hsv(...pixel))
      }

      ledSeq2Send.push(blendColors(tmp_arr).join(','))
    }

    if(fetchAllowed) {
      fetchAllowed = false

      fetch('http://' + DEFINES.esp32Ip + '/GP_click?' + DEFINES.portComponentId + '=' + ledSeq2Send.join(';'), {method: 'POST'})
        .then(() => {
          if(DEFINES.LOGS) console.log("LED Seq Sended")
        })
        .catch(err => {
          if(DEFINES.LOGS) console.warn('Error while sending LED seq')
        })
        .finally(() => {
          fetchAllowed = true

          if(DEFINES.LOGS) {
            console.log(new Date() - start)
            start = +new Date()
          }
        })
    }

    imgBuffs = []
    dataLength = 0
  }
})
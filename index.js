const screenshot = require('screenshot-desktop'),
      sharp = require('sharp'),
      displayId = '\\\\.\\DISPLAY1',
      ledAm = 292,
      esp32Ip = '192.168.1.15',
      portComponentId = 'txt_led_sequence',
      // displaySamples_x = 292,
      // displaySamples_y = 10
      displaySamples_x = 0,
      displaySamples_y = 0

const CONSTANT_BRIGHTNESS = false,
      LOGS = false

function blendColors(colorArray) {
  const [r, g, b] = colorArray.reduce(([sum_r, sum_g, sum_b], [r, g, b]) => {
                      return [sum_r + r, sum_g + g, sum_b + b]
                    }, [0, 0, 0])

  return [Math.round(r / colorArray.length), Math.round(g / colorArray.length), Math.round(b / colorArray.length)]
}

function rgb2hsv(r, g, b) {

  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min

  let h = 0, s = 0, v = max;
  s = max === 0 ? 0 : d / max

  if(max === min) h = 0
  else {
    switch(max) {
      case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
      case g:
          h = (b - r) / d + 2
          break
      case b:
          h = (r - g) / d + 4
          break
    }

    h /= 6
  }

  return [
    Math.round(h * 255),
    Math.round(s * 255),
    CONSTANT_BRIGHTNESS ? 255 : Math.round(v * 255)
  ]
}

function getPixelFromSeq(width, dataSeq, channels, x, y) {
  const dataIndex = y * width * channels + x * channels
  return [
    dataSeq[dataIndex],
    dataSeq[dataIndex+1],
    dataSeq[dataIndex+2]
  ]
}

const start = +new Date()

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
              // tmp_arr.push(pixel)
            }

            ledSeq2Send.push(blendColors(tmp_arr))
          }

          // console.log(ledSeq2Send)
          console.log(new Date() - start)


          // for (let i = 0; i < data.length; i += channels) {

          //   const r = data[i]
          //   const g = data[i + 1]
          //   const b = data[i + 2]

          //   const y = Math.floor(i / (width * channels))
          //   if(rgbImg[y] === undefined) rgbImg[y] = []

          //   rgbImg[y].push([r, g, b])
          // }

          // for(let x = 0; x < width; x++) {

          //   const column = rgbImg.reduce((arr, row) => {
          //                     arr.push(row[x])
          //                     return arr
          //                   }, [])

          //   rgbPreFinalImg.push(blendColors(column))
          // }

          // const k = Math.floor(width / ledAm)

          // for(let i = 0; i < ledAm; i++) {
          //   const tmp_arr = [];
          //   for(let j = i * k; j < (i + 1) * k; j++) {
          //     tmp_arr.push(rgbPreFinalImg[j])
          //   }

          //   rgbFinalImg[i] = blendColors(tmp_arr)
          // }

          // const led_seq_data = rgbFinalImg.map(rgb => rgb2hsv(...rgb).join(',')).join(';')

          // fetch('http://' + esp32Ip + '/GP_click?' + portComponentId + '=' + led_seq_data, {method: 'POST'})
          //   .then(() => {
          //     if(LOGS) console.log('LED Seq Sended')
          //     res(led_seq_data)
          //   })
          //   .catch(err => {
          //     if(LOGS) console.warn('Error while sending LED seq')
          //     rej(err)
          //   })

          // console.log(new Date() - start)
          // start = +new Date()
        })
    })
  })
}

setLeds()

// function foo() {
//   setLeds()
//     .catch(err => {
//       if(LOGS) console.log('Error catched!')
//     })
//     .finally(foo)
// }
// foo()
const screenshot = require('screenshot-desktop'),
      sharp = require('sharp'),
      displayId = '\\\\.\\DISPLAY1',
      ledAm = 292,
      esp32Ip = '192.168.1.15',
      portComponentId = 'txt_led_sequence'

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

// const start = +new Date()

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
                rgbImg = [],
                rgbPreFinalImg = [],
                rgbFinalImg = []

          for (let i = 0; i < data.length; i += channels) {

            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]

            const y = Math.floor(i / (width * channels))
            if(rgbImg[y] === undefined) rgbImg[y] = []

            rgbImg[y].push([r, g, b])
          }

          for(let x = 0; x < width; x++) {

            const column = rgbImg.reduce((arr, row) => {
                              arr.push(row[x])
                              return arr
                            }, [])

            rgbPreFinalImg.push(blendColors(column))
          }

          const k = Math.floor(width / ledAm)

          for(let i = 0; i < ledAm; i++) {
            const tmp_arr = [];
            for(let j = i * k; j < (i + 1) * k; j++) {
              tmp_arr.push(rgbPreFinalImg[j])
            }

            rgbFinalImg[i] = blendColors(tmp_arr)
          }

          const led_seq_data = rgbFinalImg.map(rgb => rgb2hsv(...rgb).join(',')).join(';')

          fetch('http://' + esp32Ip + '/GP_click?' + portComponentId + '=' + led_seq_data, {method: 'POST'})
            .then(() => {
              if(LOGS) console.log('LED Seq Sended')
              res(led_seq_data)
            })
            .catch(err => {
              if(LOGS) console.warn('Error while sending LED seq')
              rej(err)
            })

          // console.log(new Date() - start)
          // start = +new Date()
        })
    })
  })
}

function foo() {
  setLeds()
    .catch(err => {
      if(LOGS) console.log('Error catched!')
    })
    .finally(foo)
}
foo()
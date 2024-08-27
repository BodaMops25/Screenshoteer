const {Monitor} = require('node-screenshots'),
      sharp = require('sharp'),
      displayId = '\\\\.\\DISPLAY1'

const start = +new Date()

const display = Monitor.all().find(display => display.name === displayId),
      imgRaw =  display.captureImageSync().toRawSync()

console.log(imgRaw)

// sharp(imgRaw)
//   // .raw()
//   // .ensureAlpha()
//   .toBuffer()
//   .then(({ data, info }) => {
    console.log(new Date() - start)
//   })

// screenshot({screen: displayId})
//     .then(imgBuff => {

//       // sharp(imgBuff)
//       //   .raw()
//       //   .ensureAlpha()
//       //   .toBuffer({ resolveWithObject: true })
//       //   .then(({ data, info }) => {
//       //   })
//         console.log(new Date() - start)
//     })
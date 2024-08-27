const screenshot = require('screenshot-desktop'),
      sharp = require('sharp'),
      displayId = '\\\\.\\DISPLAY1'

const start = +new Date()

screenshot({screen: displayId})
    .then(imgBuff => {

      // sharp(imgBuff)
      //   .raw()
      //   .ensureAlpha()
      //   .toBuffer({ resolveWithObject: true })
      //   .then(({ data, info }) => {
      //   })
        console.log(new Date() - start)
    })
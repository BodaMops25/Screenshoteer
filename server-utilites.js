import spawn from 'cross-spawn'

export function createLEDSeqFlowHSV({
  ledNum,
  framerate,
  onRawRGBData
}) {
  const imgSize = ledNum * 3
  const ffmpeg_process = spawn(
    'ffmpeg',
    [
      "-fflags", "nobuffer",
      "-flags", "low_delay",
      "-framerate", framerate,
      "-f", "gdigrab",
      "-video_size", "2560x1440",
      "-i", "desktop",
      '-vf', `scale=${ledNum}:1:flags=area`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-"
    ],
    {stdio: 'pipe'}
  )
  let imgBuffs = []
  let dataLength = 0

  ffmpeg_process.stdout.on('data', (chunck) => {
    imgBuffs.push(chunck)
    dataLength += chunck.length

    if(dataLength >= imgSize) {

      const data = Buffer.concat(imgBuffs).subarray(0, imgSize)

      if(onRawRGBData) onRawRGBData(data)

      imgBuffs = []
      dataLength = 0
    }
  })
}
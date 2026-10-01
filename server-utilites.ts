import {spawn} from 'child_process'
import dgram from 'dgram';
import { WLEDClient } from 'wled-client';

export function createLEDSeqFlow({
  ledNum,
  framerate,
  onRawRGBData
}: {
  ledNum: number,
  framerate: number,
  onRawRGBData: (data: Buffer<ArrayBuffer>) => void
}) {
  const imgSize = ledNum * 3
  const ffmpeg_process = spawn(
    'ffmpeg',
    [
      "-fflags", "nobuffer",
      "-flags", "low_delay",
      "-framerate", framerate.toString(),
      "-f", "gdigrab",
      "-video_size", "2560x1440",
      "-i", "desktop",
      '-vf', `scale=300:1,eq=brightness=0:contrast=1:saturation=3,avgblur=3,scale=${ledNum}:1:flags=area`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-"
    ],
    {stdio: 'pipe'}
  )
  let imgBuffs: Buffer<ArrayBufferLike>[] = []
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

  ffmpeg_process.stderr.on("data", (data) => {
    // console.log("FFmpeg ERROR:", data.toString());
  });

  ffmpeg_process.on("close", (code) => {
    console.log("FFmpeg exited with code", code);
  });

  ffmpeg_process.on("error", (err) => {
    console.error("Failed to start FFmpeg:", err);
  });
}

export class WLEDDdp {
    private _socket: dgram.Socket;
    private readonly _port: number;
    private readonly _host: string;
    private initiallyOff = true;

    private jsonClient;

    private readonly VERSION = 0x01; // Version 1, PUSH flag not set, other flags are 0
    private readonly DATA_TYPE = 0x01; // Data type RGB
    private readonly OUTPUT_ID = 0x01; // Default ID for output device
    private readonly MAX_LED_DATA_PER_PACKET = 1440

    constructor(host: string, port: number) {
        this._port = port;
        this._host = host;
        this._socket = dgram.createSocket('udp4');
        this.jsonClient = new WLEDClient({
            host,
            websocket: false
        });

        // this.initLeds().catch((error) => {
        //     console.error('Error initializing LEDs:', error);
        // });
    }

    public async initLeds(): Promise<void> {
        await this.jsonClient.init();
        console.log('LEDs initialized', this.jsonClient.info, this.jsonClient.state);
        this.initiallyOff = !this.jsonClient.state.on;
        if (this.initiallyOff) {
            await this.jsonClient.turnOn();
        }
    }

    public getClientInfo(): {[key: string]: any} {
        return this.jsonClient.info
    }

    public sendRaw(data: Buffer, offset = 0) {
        let chunk_offset = 0
        do {
            const packet = this.createPacket(
                data.subarray(chunk_offset, chunk_offset + this.MAX_LED_DATA_PER_PACKET),
                chunk_offset + offset
            );
            this.sendPacket(packet);
            chunk_offset += this.MAX_LED_DATA_PER_PACKET
        } while(chunk_offset < data.length)
    }

    public send(data: RGB[]) {
        const packet = this.createPacket(data);
        this.sendPacket(packet);
    }

    public async setBrightness(brightness: number) {
        await this.jsonClient.setBrightness(brightness);
    }

    public getLeds(initialFill?: RGB): RGB[] {
        return new Array(this.jsonClient.info.leds.count || 240).fill(initialFill ?? [0,0,0]);
    }

    private createPacket(leds: RGB[] | Buffer, offset: number = 0): Buffer {
        const data_length = leds.length
        const header = Buffer.alloc(10); // DDP header is 10 bytes
        // header[0] = this.VERSION;
        // header[1] = 0x00; // Reserved for future use, set to 0.
        // header[2] = this.DATA_TYPE;
        // header[3] = this.OUTPUT_ID;
        // header[4] = 0x01;
        // header[5] = 0x00;
        // header.writeUInt32BE(0, 4); // Offset set to 0
        // // header.writeUInt16BE(714*3, 6); 
        // // header.writeUInt16BE(leds.length * 3, 8); // Data length
        // header.writeUInt16BE(leds.length / 3, 8); // Data length

        header[0] = 0b01000000
        header[1] = 0b00000000
        header[2] = 0b00000000
     // header[2] = 0b00001000 // rgb
     // header[2] = 0b00011000 // rgbw
        header[3] = 0b00000001

        // header[4] = 0b00000000
        // header[5] = 0b00000000
        // header[6] = 0b00000000
        // header[7] = 0b00000000
        
        header.writeUInt32BE(offset, 4)
        header.writeUInt16BE(data_length, 8)

        if(Array.isArray(leds)) {
            const data = Buffer.concat(leds.map(color => {
                return Buffer.from([ color[0], color[1], color[2] ]);
            }));
    
            return Buffer.concat([ header, data ]);
        }

        return Buffer.concat([ header, leds ]);
    }

    private sendPacket(packet: Buffer) {
        if(packet.length > 1500) {
            console.error('Packet limit exceeded')
            return
        }
        this._socket.send(
            packet,
            this._port,
            this._host,
            (error) => {
                if (error) {
                    console.error('Error sending packet:', error);
                }
            });
    }
}
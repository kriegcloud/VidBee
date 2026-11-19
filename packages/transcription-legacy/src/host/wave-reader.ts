import * as Layer from 'effect/Layer'
import {BinaryWaveReader} from '../../../transcription/src/WaveReader.service'
import type {BinaryWaveView} from '../../../transcription/src/WaveReader.service'
const view=(buf:Buffer):BinaryWaveView=>({
 length:buf.length,ascii:(start,end)=>buf.toString('ascii',start,end),
 uint16:offset=>buf.readUInt16LE(offset),uint32:offset=>buf.readUInt32LE(offset),
 int16:offset=>buf.readInt16LE(offset),float32:offset=>buf.readFloatLE(offset),
 byte:offset=>buf[offset],subarray:(start,end)=>view(buf.subarray(start,end)),
})
export const BinaryWaveReaderLegacy=Layer.succeed(BinaryWaveReader,{view:bytes=>view(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength))})

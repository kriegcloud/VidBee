import { cp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
export async function buildTranscriptionFixture(profile, models, build, command) {
  const dir = path.join(profile, 'transcription-fixtures')
  await mkdir(dir, { recursive: true })
  await cp(
    path.join(models, 'transcription/sherpa-onnx-whisper-tiny/test_wavs/0.wav'),
    path.join(dir, 'speech.wav')
  )
  const ffmpeg = path.join(build, 'resources/resources/ffmpeg/ffmpeg')
  const encode = (argv) =>
    command(ffmpeg, [
      ...argv.slice(0, -1),
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      argv.at(-1)
    ])
  await encode([
    '-nostdin',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=16000:cl=mono',
    '-t',
    '4',
    '-c:a',
    'pcm_s16le',
    path.join(dir, 'silence.wav')
  ])
  await encode([
    '-nostdin',
    '-v',
    'error',
    '-stream_loop',
    '19',
    '-i',
    path.join(dir, 'speech.wav'),
    '-c:a',
    'pcm_s16le',
    path.join(dir, 'long.wav')
  ])
  await encode([
    '-nostdin',
    '-v',
    'error',
    '-i',
    path.join(dir, 'speech.wav'),
    '-i',
    path.join(models, 'transcription/sherpa-onnx-whisper-tiny/test_wavs/1.wav'),
    '-filter_complex',
    '[0:a][1:a]concat=n=2:v=0:a=1[out]',
    '-map',
    '[out]',
    '-c:a',
    'pcm_s16le',
    path.join(dir, 'two-clips.wav')
  ])
  for (const [lang, text] of [
    ['eng', 'Alice: A synthetic caption.'],
    ['deu', '[AI] Bob: Eine synthetische Untertitelzeile.']
  ]) {
    await writeFile(path.join(dir, `${lang}.srt`), `1\n00:00:00,000 --> 00:00:02,000\n${text}\n\n`)
  }
  await encode([
    '-nostdin',
    '-v',
    'error',
    '-i',
    path.join(dir, 'silence.wav'),
    '-i',
    path.join(dir, 'eng.srt'),
    '-i',
    path.join(dir, 'deu.srt'),
    '-map',
    '0:a',
    '-map',
    '1',
    '-map',
    '2',
    '-c:a',
    'pcm_s16le',
    '-c:s',
    'srt',
    '-metadata:s:s:0',
    'language=eng',
    '-metadata:s:s:1',
    'language=deu',
    path.join(dir, 'captions.mkv')
  ])
}

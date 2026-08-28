// Replay the production diarization pipeline (no ASR) on a wav and compare
// against a cloud reference transcript. See packages/transcription/docs/speaker-diarization.md §6 in the VidBee-Landing workspace.
//
// Usage:
//   ffmpeg -y -i <video> -ac 1 -ar 16000 -vn /tmp/a.wav
//   node scripts/diarization-verify.cjs /tmp/a.wav <reference.txt>
//
// Reference format: lines like "Speaker N MM:SS" or "Speaker N HH:MM:SS"
// before each paragraph (通义听悟等云端产品的导出格式).
//
// Models are read from VIDBEE_TRANSCRIPTION_MODELS_DIR, defaulting to the
// desktop app's models dir. Keep constants below in sync with
// src/speaker-cluster.ts / src/speaker-chunks.ts when the pipeline changes.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sherpa = require('sherpa-onnx-node')

const MODELS =
  process.env.VIDBEE_TRANSCRIPTION_MODELS_DIR ??
  path.join(os.homedir(), 'Library/Application Support/vidbee/models/transcription')
const SEG = path.join(MODELS, 'sherpa-onnx-pyannote-segmentation-3-0/model.onnx')
const EMB = path.join(MODELS, '3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx')

// Mirror of production constants (speaker-cluster.ts / speaker-chunks.ts).
const CHUNK_S = 600
const OVERLAP_S = 20
const THRESHOLD = 0.5
const SHORT_S = 5
const FOLD_MAX_S = 60
const FOLD_FRACTION = 0.05
const FOLD_DIST = 0.65
const CAP = 8

const wavPath = process.argv[2]
const refPath = process.argv[3]
if (!wavPath) {
  console.error('usage: node diarization-verify.cjs <wav 16k mono> [reference.txt]')
  process.exit(1)
}
const wave = sherpa.readWave(wavPath)
const totalS = wave.samples.length / wave.sampleRate

const sd = new sherpa.OfflineSpeakerDiarization({
  segmentation: { pyannote: { model: SEG, windowShiftRatio: 0.1 }, numThreads: 2, provider: 'cpu' },
  embedding: { model: EMB, numThreads: 2, provider: 'cpu' },
  clustering: { numClusters: -1, threshold: THRESHOLD },
  minDurationOn: 0.3,
  minDurationOff: 0.5
})
const extractor = new sherpa.SpeakerEmbeddingExtractor({
  model: EMB,
  numThreads: 2,
  provider: 'cpu'
})

const windows = []
{
  let start = 0
  if (totalS <= CHUNK_S + OVERLAP_S) windows.push([0, totalS])
  else
    while (start < totalS) {
      const end = Math.min(totalS, start + CHUNK_S)
      windows.push([start, end])
      if (end >= totalS) break
      start = end - OVERLAP_S
    }
}

const units = []
const embedFor = (turnsArr) => {
  const sorted = [...turnsArr].sort((a, b) => b.end - b.start - (a.end - a.start))
  const parts = []
  let used = 0
  for (const t of sorted) {
    if (used >= 8) break
    const take = Math.min(t.end - t.start, 8 - used)
    const s = Math.floor(t.start * wave.sampleRate)
    const e = Math.min(wave.samples.length, Math.floor((t.start + take) * wave.sampleRate))
    if (e <= s) continue
    parts.push(wave.samples.subarray(s, e))
    used += take
  }
  if (used < 0.3) return null
  const total = parts.reduce((s, p) => s + p.length, 0)
  const joined = new Float32Array(total)
  let off = 0
  for (const p of parts) {
    joined.set(p, off)
    off += p.length
  }
  const stream = extractor.createStream()
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: joined })
  const v = extractor.compute(stream, false)
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm) || 1
  return Array.from(v, (x) => x / norm)
}

for (let ci = 0; ci < windows.length; ci += 1) {
  const [ws, we] = windows[ci]
  const slice = wave.samples.subarray(
    Math.floor(ws * wave.sampleRate),
    Math.floor(we * wave.sampleRate)
  )
  const raw = sd.process(slice)
  const turns = Array.isArray(raw)
    ? raw
    : (() => {
        const out = []
        for (let i = 0; i < (raw?.size ?? 0); i += 1) out.push(raw.get(i))
        return out
      })()
  const byLocal = new Map()
  for (const t of turns) {
    const g = { start: t.start + ws, end: t.end + ws }
    const arr = byLocal.get(t.speaker) ?? []
    arr.push(g)
    byLocal.set(t.speaker, arr)
  }
  for (const [local, arr] of byLocal) {
    const sec = arr.reduce((s, t) => s + (t.end - t.start), 0)
    units.push({ key: `c${ci}:s${local}`, sec, turns: arr, vector: embedFor(arr) })
  }
  console.error(`chunk ${ci + 1}/${windows.length}: ${byLocal.size} local speakers`)
}

const dist = (a, b) => {
  let dot = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) dot += a[i] * b[i]
  return 1 - dot
}

const withVec = units.filter((u) => u.vector)
const n = withVec.length
const d = Array.from({ length: n }, () => Array(n).fill(0))
for (let i = 0; i < n; i += 1)
  for (let j = i + 1; j < n; j += 1) d[i][j] = d[j][i] = dist(withVec[i].vector, withVec[j].vector)

console.log(`\n[input] ${totalS.toFixed(0)}s audio, ${n} local speaker units`)

const thresholdStop = () => {
  const members = withVec.map((_, i) => [i])
  const active = withVec.map((_, i) => i)
  const linkage = (a, b) => {
    let sum = 0
    let cnt = 0
    for (const i of members[a]) for (const j of members[b]) (sum += d[i][j]), (cnt += 1)
    return cnt ? sum / cnt : Infinity
  }
  const mergeOnce = () => {
    let bi = -1
    let bj = -1
    let best = Infinity
    for (let x = 0; x < active.length; x += 1)
      for (let y = x + 1; y < active.length; y += 1) {
        const v = linkage(active[x], active[y])
        if (v < best) {
          best = v
          bi = active[x]
          bj = active[y]
        }
      }
    if (bi < 0 || best > THRESHOLD) return false
    members[bi].push(...members[bj])
    members[bj] = []
    active.splice(active.indexOf(bj), 1)
    return true
  }
  while (active.length > 1 && mergeOnce()) {}
  return { members, active }
}

const durOf = (idxs) => idxs.reduce((s, i) => s + withVec[i].sec, 0)
const centroid = (idxs) => {
  const dim = withVec[idxs[0]].vector.length
  const c = new Array(dim).fill(0)
  for (const i of idxs) for (let k = 0; k < dim; k += 1) c[k] += withVec[i].vector[k]
  let norm = 0
  for (const x of c) norm += x * x
  norm = Math.sqrt(norm) || 1
  return c.map((x) => x / norm)
}

const { active, members } = thresholdStop()
const cl = active.map((id) => ({ idxs: [...members[id]], sec: durOf(members[id]) }))
console.log(
  `[threshold stop] clusters=${cl.length} durations: ${cl
    .map((c) => c.sec.toFixed(0) + 's')
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .join(', ')}`
)

// Duration-aware fold, mirroring foldShortClusters + capExcessClusters.
const totalSpeech = cl.reduce((s, c) => s + c.sec, 0)
const foldThr = Math.max(SHORT_S, Math.min(FOLD_MAX_S, FOLD_FRACTION * totalSpeech))
const mains = cl.filter((c) => c.sec >= foldThr).sort((a, b) => b.sec - a.sec)
const small = cl.filter((c) => c.sec < foldThr)
let kept = mains.slice(0, CAP)
const rest = [...mains.slice(CAP), ...small]
const keptCentroids = kept.map((c) => centroid(c.idxs))
let unknown = 0
const standalone = []
for (const c of rest) {
  const cc = centroid(c.idxs)
  let bi = -1
  let best = Infinity
  keptCentroids.forEach((kc, i) => {
    const v = dist(kc, cc)
    if (v < best) {
      best = v
      bi = i
    }
  })
  if (bi >= 0 && best <= FOLD_DIST) kept[bi].idxs.push(...c.idxs)
  else if (c.sec < SHORT_S) unknown += c.sec
  else standalone.push(c)
}
kept = [...kept, ...standalone]
kept.forEach((c) => (c.sec = durOf(c.idxs)))
kept.sort((a, b) => b.sec - a.sec)
console.log(
  `[pipeline result] foldThr=${foldThr.toFixed(1)}s speakers=${kept.length} durations: ${kept
    .map((c) => c.sec.toFixed(0) + 's')
    .join(', ')} unknown=${unknown.toFixed(0)}s`
)
const finalCentroids = kept.map((c) => centroid(c.idxs))
console.log('[final centroid distances]')
for (let i = 0; i < kept.length; i += 1)
  console.log(
    `  K${i + 1}(${kept[i].sec.toFixed(0)}s): ` +
      finalCentroids
        .map((fc, j) => (j === i ? ' -- ' : dist(finalCentroids[i], fc).toFixed(2)))
        .join(' ')
  )

// Reference comparison on a 1s grid.
if (!refPath || !fs.existsSync(refPath)) {
  console.log('\n(no reference txt given; skipped comparison)')
  process.exit(0)
}
const txt = fs.readFileSync(refPath, 'utf8')
const re = /^Speaker (\d+) (\d{2}):(\d{2})(?::(\d{2}))?\s*$/gm
const refTurns = []
let m
while ((m = re.exec(txt))) {
  const h = m[4] ? +m[2] : 0
  const mm = m[4] ? +m[3] : +m[2]
  const ss = m[4] ? +m[4] : +m[3]
  refTurns.push({ spk: +m[1], t: h * 3600 + mm * 60 + ss })
}
if (refTurns.length === 0) {
  console.error('no "Speaker N MM:SS" lines found in reference; skip comparison')
  process.exit(0)
}
const refSpeakers = [...new Set(refTurns.map((r) => r.spk))].sort()
const T = Math.ceil(totalS)
const ref = new Int8Array(T).fill(-1)
for (let i = 0; i < refTurns.length; i += 1) {
  const end = i + 1 < refTurns.length ? refTurns[i + 1].t : T
  for (let t = refTurns[i].t; t < Math.min(end, T); t += 1) ref[t] = refTurns[i].spk
}
const refDur = new Map()
for (let t = 0; t < T; t += 1) if (ref[t] > 0) refDur.set(ref[t], (refDur.get(ref[t]) ?? 0) + 1)
console.log(
  `\n[reference] ${refSpeakers.length} speakers: ${refSpeakers
    .map((s) => `S${s}=${refDur.get(s) ?? 0}s`)
    .join(', ')}`
)

const ours = new Int8Array(T).fill(-1)
kept.forEach((c, label) => {
  for (const i of c.idxs)
    for (const turn of withVec[i].turns)
      for (let t = Math.floor(turn.start); t < Math.min(T, Math.ceil(turn.end)); t += 1)
        ours[t] = label
})

const confusion = kept.map(() => new Map())
for (let t = 0; t < T; t += 1) {
  if (ours[t] < 0 || ref[t] < 0) continue
  const row = confusion[ours[t]]
  row.set(ref[t], (row.get(ref[t]) ?? 0) + 1)
}
console.log('[confusion] our cluster -> seconds per ref speaker')
confusion.forEach((row, i) => {
  const cells = refSpeakers.map((s) => `S${s}:${row.get(s) ?? 0}s`).join(' ')
  console.log(`  K${i + 1}(${kept[i].sec.toFixed(0)}s) ${cells}`)
})

const K = kept.length
const assignBest = () => {
  let best = { score: -1, map: null }
  const chosen = new Map()
  const rec = (ri) => {
    if (ri === refSpeakers.length) {
      let score = 0
      for (const [s, k] of chosen) score += confusion[k]?.get(s) ?? 0
      if (score > best.score) best = { score, map: new Map(chosen) }
      return
    }
    const s = refSpeakers[ri]
    rec(ri + 1)
    for (let k = 0; k < K; k += 1) {
      if ([...chosen.values()].includes(k)) continue
      chosen.set(s, k)
      rec(ri + 1)
      chosen.delete(s)
    }
  }
  rec(0)
  return best
}
const { score, map } = assignBest()
let joint = 0
for (let t = 0; t < T; t += 1) if (ours[t] >= 0 && ref[t] >= 0) joint += 1
console.log(
  `\n[compare] best mapping: ${[...(map ?? new Map())]
    .map(([s, k]) => `refS${s}->K${k + 1}`)
    .join(', ')}`
)
console.log(
  `[compare] agreement ${(joint ? (score / joint) * 100 : 0).toFixed(1)}% over ${joint}s jointly covered`
)

// Only transcription documents enter this named timing-race rule.
export function normalizeTranscription(value) {
  const walk = (entry, key = '') => {
    if (typeof entry === 'string') {
      if (key === 'provider' && /^(cpu|cuda|directml|coreml)$/.test(entry)) {
        return '<provider>'
      }
      if (key === 'log') {
        return entry
          .replace(/^compute\.provider=\w+/gm, 'compute.provider=<provider>')
          .replace(/^(compute\.probe=)\w+/gm, '$1<provider>')
          .replace(
            /^(compute\.probe=<provider> ok=(?:true|false) durationMs=)[^ \n]+/gm,
            '$1<probe-duration>'
          )
          .replace(
            /^(compute\.provider=<provider> reason=)(?:accelerator-faster|cpu-faster-or-within-margin)(?= |$)/gm,
            '$1<benchmark-choice>'
          )
      }
    }
    if (Array.isArray(entry)) {
      return entry.map((item) => walk(item, key))
    }
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry).map(([field, item]) => [field, walk(item, field)])
      )
    }
    return entry
  }
  return walk(value)
}

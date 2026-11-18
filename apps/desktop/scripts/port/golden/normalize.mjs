// Each rule is deliberately narrow; arrays and application fields retain order.
export function normalize(value, roots = []) {
  const ids = new Map()
  const id = (raw) => {
    if (!ids.has(raw)) {
      ids.set(raw, `<id:${ids.size + 1}>`)
    }
    return ids.get(raw)
  }
  const walk = (entry, key = '', location = '$') => {
    if (typeof entry === 'number') {
      if (/^(pid|pidStartedAt|port)$/.test(key)) {
        return `<${key}>`
      }
      if (
        /^(expiresAt|startedAt|finishedAt|updatedAt|createdAt|completedAt|downloadedAt|enteredStatusAt|lastSeenAt|lastConnectedAt|lastUsedAt|lastHeartbeatAt|leaseExpiresAt)$/.test(
          key
        ) &&
        entry > 1_760_000_000_000
      ) {
        return '<timestamp>'
      }
      if (/^(elapsedMs|latencyMs)$/.test(key)) {
        return '<duration>'
      }
      return entry
    }
    if (typeof entry === 'string') {
      // MCP wraps JSON payloads in text content. Decode those for field-level diffs.
      if (/^\$\.result\.content\.\d+\.text$/.test(location) && /^[[{]/.test(entry)) {
        try {
          return { $jsonText: walk(JSON.parse(entry), key, `${location}.$jsonText`) }
        } catch {
          /* ordinary text */
        }
      }
      let result = entry
      for (const [root, name] of roots) {
        result = result.replaceAll(root, name)
      }
      result = result.replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, id)
      result = result.replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        id
      )
      if (/^[a-f0-9]{64}$/.test(result) && /^(token|session|id|tokenHash)$/.test(key)) {
        return key === 'id' ? id(result) : '<token>'
      }
      if (key === 'ffmpegVersion') {
        // The ffmpeg binary is downloaded at setup time, so its build id differs per build.
        result = result.replace(/^ffmpeg version \S+/, 'ffmpeg version <ffmpeg-build>')
      }
      result = result.replace(/Bearer [a-f0-9]{64}/g, 'Bearer <token>')
      result = result.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:<port>')
      if (
        /^(expiresAt|startedAt|finishedAt|updatedAt|createdAt|completedAt|timestamp|pidStartedAt)$/.test(
          key
        ) &&
        /^\d{4}-\d\d-\d\dT/.test(result) &&
        Date.parse(result) > 1_760_000_000_000
      ) {
        return '<timestamp>'
      }
      if (result.includes('/home/')) {
        throw new Error(`Unnormalized private home path at ${key}: add a specific root rule`)
      }
      return result
    }
    if (Array.isArray(entry)) {
      return entry.map((item, index) => walk(item, key, `${location}.${index}`))
    }
    if (entry && typeof entry === 'object') {
      // The ASR status reports the host's hardware and the tiers recommended for it.
      // Both differ per machine (a workstation and a CI runner disagree), so they are
      // replaced as a unit; the tier catalog and every other field stay literal.
      if (
        entry.machine &&
        typeof entry.machine === 'object' &&
        'cpuCount' in entry.machine &&
        Array.isArray(entry.recommended)
      ) {
        return walk(
          {
            ...entry,
            machine: {
              ...entry.machine,
              arch: '<machine>',
              class: '<machine>',
              cpuCount: '<machine>',
              gpu: '<machine>',
              gpuName: '<machine>',
              os: '<machine>',
              ramBytes: '<machine>'
            },
            recommended: '<machine-dependent>'
          },
          key,
          location
        )
      }
      return Object.fromEntries(
        Object.entries(entry).map(([field, item]) => [
          field,
          walk(item, field, `${location}.${field}`)
        ])
      )
    }
    return entry
  }
  return walk(value)
}

export function differences(expected, actual, path = '$') {
  if (Object.is(expected, actual)) {
    return []
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return [
      `${path}: expected ${Array.isArray(expected) ? 'array' : 'object'}, received ${Array.isArray(actual) ? 'array' : 'object'}`
    ]
  }
  if (!(expected && actual) || typeof expected !== 'object' || typeof actual !== 'object') {
    return [`${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`]
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  return [...keys].flatMap((key) => differences(expected[key], actual[key], `${path}.${key}`))
}

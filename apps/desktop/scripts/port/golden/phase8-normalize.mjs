/** Named extension-format-user-agent rule; never applied to an older case. */
export function normalizeExtensionMetadata(value) {
  const copy = structuredClone(value)
  const formats = copy?.response?.body?.formats
  if (Array.isArray(formats)) {
    for (const format of formats) {
      const headers = format?.http_headers
      if (headers && Object.hasOwn(headers, 'User-Agent')) {
        headers['User-Agent'] = '<user-agent>'
      }
    }
  }
  return copy
}

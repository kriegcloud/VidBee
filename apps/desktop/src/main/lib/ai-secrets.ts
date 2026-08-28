/** Prefix for secrets stored with Electron safeStorage. */
export const AI_SECRET_ENCRYPTED_PREFIX = 'enc:'
/** Prefix for secrets stored as plaintext when OS encryption is unavailable. */
export const AI_SECRET_PLAIN_PREFIX = 'plain:'

export interface AiSecretCodec {
  encryptString: (plain: string) => Buffer
  decryptString: (buffer: Buffer) => string
  isEncryptionAvailable: () => boolean
}

/**
 * Seal an API key for disk. Uses OS encryption when available.
 *
 * @param value Raw API key.
 * @param codec Electron safeStorage-compatible codec.
 */
export const sealAiSecret = (value: string, codec: AiSecretCodec): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (!codec.isEncryptionAvailable()) {
    return `${AI_SECRET_PLAIN_PREFIX}${trimmed}`
  }
  return `${AI_SECRET_ENCRYPTED_PREFIX}${codec.encryptString(trimmed).toString('base64')}`
}

/**
 * Restore a sealed API key. Empty or corrupt values become an empty string.
 *
 * @param sealed Value read from disk.
 * @param codec Electron safeStorage-compatible codec.
 */
export const openAiSecret = (sealed: string | undefined, codec: AiSecretCodec): string => {
  if (!sealed) {
    return ''
  }
  if (sealed.startsWith(AI_SECRET_PLAIN_PREFIX)) {
    return sealed.slice(AI_SECRET_PLAIN_PREFIX.length)
  }
  if (!sealed.startsWith(AI_SECRET_ENCRYPTED_PREFIX)) {
    return sealed
  }
  try {
    const buffer = Buffer.from(sealed.slice(AI_SECRET_ENCRYPTED_PREFIX.length), 'base64')
    return codec.decryptString(buffer)
  } catch {
    return ''
  }
}

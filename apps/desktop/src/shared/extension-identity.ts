/** Shared public identity for unpacked development builds; no signing key is distributed.
 *
 * **Example** (Access the VIDBEE_DEV_EXTENSION_PUBLIC_KEY contract)
 *
 * ```ts
 * import { VIDBEE_DEV_EXTENSION_PUBLIC_KEY } from './extension-identity.js'
 * void VIDBEE_DEV_EXTENSION_PUBLIC_KEY
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const VIDBEE_DEV_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvR94OTlDt5jOJFM5081epkW3OVde/PJMccbrOtbDyWapyycMdnp9PVn3xRy3x99cJLP64GOUKRJvZ3qrwi2KrUbrruXYco6Njl7cJTLWx1dAx+yg7v0CyEA/kP8PTjwqLA8wYyrOwNAftHvngf2rzCMP2fcDniRyDk/jemqC21SmtYKOGpj5ENdUIhQQfqhAW4ZKoG8TSNo+BqcDENxFLfjjVOiip/LxJQJYS8y3eUblpphprc77Zhf2wnrgoyUGUE7+om9Ki8g34QnNC3nkvSlVHpHppPj3DsRunwuD8VhR4fTdWYhgOK6uzj+QqGSsMPh9Ro7OGggScvfC9vipcQIDAQAB'

/** VIDBEE_DEV_EXTENSION_ID shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the VIDBEE_DEV_EXTENSION_ID contract)
 *
 * ```ts
 * import { VIDBEE_DEV_EXTENSION_ID } from './extension-identity.js'
 * void VIDBEE_DEV_EXTENSION_ID
 * ```
 *
 */
export const VIDBEE_DEV_EXTENSION_ID = 'gidnfopabhandhndkgihfbnegphbeadp'
/** VIDBEE_DEV_EXTENSION_ORIGIN shared contract.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the VIDBEE_DEV_EXTENSION_ORIGIN contract)
 *
 * ```ts
 * import { VIDBEE_DEV_EXTENSION_ORIGIN } from './extension-identity.js'
 * void VIDBEE_DEV_EXTENSION_ORIGIN
 * ```
 *
 */
export const VIDBEE_DEV_EXTENSION_ORIGIN = `chrome-extension://${VIDBEE_DEV_EXTENSION_ID}`

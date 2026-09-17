const HTTPONLY_PREFIX = '#HttpOnly_'

export interface PlaywrightCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

export interface NetscapeCookieRow {
  domain: string
  path: string
  secure: boolean
  expires: number
  name: string
  value: string
  httpOnly: boolean
}

/** Parse a Netscape cookies.txt body into cookie rows. */
export const parseNetscapeCookieFile = (text: string): NetscapeCookieRow[] => {
  const cookies: NetscapeCookieRow[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || (line.startsWith('#') && !line.startsWith(HTTPONLY_PREFIX))) {
      continue
    }
    const httpOnly = line.startsWith(HTTPONLY_PREFIX)
    const fields = (httpOnly ? line.slice(HTTPONLY_PREFIX.length) : line).split('\t')
    if (fields.length < 7) {
      continue
    }
    const [domainField, , pathField, secureField, expiresField, name, ...rest] = fields
    if (!domainField || !name) {
      continue
    }
    const value = rest.join('\t')
    const expires = Number.parseInt(expiresField ?? '', 10)
    cookies.push({
      domain: domainField,
      path: pathField || '/',
      secure: (secureField ?? '').toUpperCase() === 'TRUE',
      expires: Number.isFinite(expires) ? expires : 0,
      name,
      value,
      httpOnly
    })
  }
  return cookies
}

/** Convert Netscape rows into Playwright cookie objects. */
export const toPlaywrightCookies = (rows: readonly NetscapeCookieRow[]): PlaywrightCookie[] => {
  const now = Math.floor(Date.now() / 1000)
  return rows.map((row) => {
    const session = row.expires <= 0 || row.expires <= now
    const domain = row.domain.replace(/^\./, '')
    return {
      name: row.name,
      value: row.value,
      domain,
      path: row.path || '/',
      expires: session ? -1 : row.expires,
      httpOnly: row.httpOnly,
      secure: row.secure,
      sameSite: 'Lax'
    }
  })
}

import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Public key from the published Chrome package keeps unpacked builds on the trusted ID.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkS2E/EkysiCB1gLY1I3FCm2kGWfIDYIaLBPuurUmD9lceotE98MEnsLKQiExgdouGpjWVdS4Y0lHZfUDIB4Y2m6ixfpm9U5ipd4hHDWyoP55u/FDS6veGUngd6ie4o+rlkJX/LyqOS1ci3lgwWyzbe9CYiYM0Ews16IDn1q8NR85yY4zXcNdR6lGunZ0I3znubGN73LwQjE3c4Hg+FrTlnowBn2genph/jHEE7UwBE0LA4Xb+ur+EjyQQqGgH6D5u6mA7DNyUYEPaDbU9a6+O10kFvLmXeJPmoJCBpe9PuL3Pz+OJ2XuUAg0CqSNqTFEaRSDMqlg5fuyYWxg9yVpYQIDAQAB',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    host_permissions: ['http://127.0.0.1/*'],
    permissions: ['activeTab', 'storage']
  }
})

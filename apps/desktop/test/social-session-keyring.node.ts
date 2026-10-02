import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSocialSessionKeyring } from '../src/main/lib/social-session-keyring'

test('a Plasma session uses KWallet for its dedicated Chrome cookies', () => {
  assert.equal(resolveSocialSessionKeyring('KDE:Plasma', true), 'kwallet')
})

test('KWallet remains selected when the launcher omits desktop variables', () => {
  assert.equal(resolveSocialSessionKeyring('', true), 'kwallet')
})

test('known non-Plasma desktops retain their own keyring selection', () => {
  assert.equal(resolveSocialSessionKeyring('GNOME', true), null)
  assert.equal(resolveSocialSessionKeyring('', false), null)
})

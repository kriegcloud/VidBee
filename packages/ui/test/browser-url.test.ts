import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBrowserOpenableUrl } from '../src/lib/url-kind'

test('only http and https URLs may be handed to a browser', () => {
  for (const url of ['https://www.threads.com/@a/post/B', 'http://example.com/x']) {
    assert.equal(isBrowserOpenableUrl(url), true, url)
  }
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<b>x</b>',
    'mailto:someone@example.com',
    'vidbee://open?x=1',
    'not a url',
    '',
    null,
    undefined
  ]) {
    assert.equal(isBrowserOpenableUrl(url), false, String(url))
  }
})

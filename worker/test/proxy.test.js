import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateHostname, rewritePlaylist, validateUpstream } from '../src/index.js'

test('blocks private and metadata addresses', () => {
  for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.2.3', '192.168.1.1', 'service.local']) {
    assert.equal(isPrivateHostname(host), true, host)
  }
  assert.equal(isPrivateHostname('radio.example.com'), false)
})

test('validates protocols and configured ports', () => {
  assert.equal(validateUpstream('http://radio.example.com:8000/live').port, '8000')
  assert.throws(() => validateUpstream('file:///etc/passwd'))
  assert.throws(() => validateUpstream('http://127.0.0.1/live'))
  assert.throws(() => validateUpstream('http://radio.example.com:9000/live'))
  assert.equal(validateUpstream('http://radio.example.com:9000/live', { ALLOWED_STREAM_PORTS: '9000' }).port, '9000')
})

test('blocks private IPv6 addresses', () => {
  assert.throws(() => validateUpstream('http://[::1]/live'))
  assert.throws(() => validateUpstream('http://[fd00::1]/live'))
})

test('rewrites HLS segments, nested playlists, and URI attributes', async () => {
  const source = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nvariant/index.m3u8\nsegment-1.ts\n'
  const output = await rewritePlaylist(source, 'http://radio.example.com/live/main.m3u8', 'https://proxy.example.com/station/abc', { STREAM_PROXY_SECRET: 'test-secret' })
  assert.match(output, /https:\/\/proxy\.example\.com\/resource\?url=/)
  assert.match(decodeURIComponent(output), /http:\/\/radio\.example\.com\/live\/key\.bin/)
  assert.match(decodeURIComponent(output), /http:\/\/radio\.example\.com\/live\/variant\/index\.m3u8/)
  assert.match(decodeURIComponent(output), /http:\/\/radio\.example\.com\/live\/segment-1\.ts/)
})

const DEFAULT_RADIO_BROWSER_API = 'https://all.api.radio-browser.info'
const DEFAULT_ALLOWED_PORTS = new Set(['80', '443', '8000', '8001', '8080', '8081', '8443', '8888'])
const PLAYLIST_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl']
const encoder = new TextEncoder()

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error(error)
      return corsJson(request, env, { error: '音频中继暂时不可用' }, 502)
    }
  },
}

async function handleRequest(request, env) {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return preflight(request, env)
  if (!['GET', 'HEAD'].includes(request.method)) return corsJson(request, env, { error: 'Method not allowed' }, 405)
  if (!isAllowedOrigin(request, env)) return corsJson(request, env, { error: 'Origin not allowed' }, 403)

  if (url.pathname === '/health') return corsJson(request, env, { ok: true })
  if (url.pathname.startsWith('/station/')) {
    const stationId = decodeURIComponent(url.pathname.slice('/station/'.length))
    if (!/^[a-f0-9-]{16,64}$/i.test(stationId)) return corsJson(request, env, { error: 'Invalid station id' }, 400)
    const streamUrl = await resolveStation(stationId, env)
    return proxyStream(request, env, streamUrl)
  }
  if (url.pathname === '/resource') {
    const upstream = url.searchParams.get('url') || ''
    const expires = url.searchParams.get('expires') || ''
    const signature = url.searchParams.get('sig') || ''
    if (!(await verifyResource(upstream, expires, signature, env))) return corsJson(request, env, { error: 'Invalid or expired resource' }, 403)
    return proxyStream(request, env, upstream)
  }
  return corsJson(request, env, { error: 'Not found' }, 404)
}

async function resolveStation(stationId, env) {
  const apiBase = (env.RADIO_BROWSER_API || DEFAULT_RADIO_BROWSER_API).replace(/\/$/, '')
  const apiUrl = `${apiBase}/json/stations/byuuid/${encodeURIComponent(stationId)}`
  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/json', 'User-Agent': 'WorldRadioProxy/1.0' },
    cf: { cacheEverything: true, cacheTtl: 300 },
  })
  if (!response.ok) throw new Error(`Radio Browser returned ${response.status}`)
  const rows = await response.json()
  const streamUrl = rows?.[0]?.url_resolved || rows?.[0]?.url
  if (!streamUrl) throw new Error('Station not found')
  validateUpstream(streamUrl, env)
  return streamUrl
}

async function proxyStream(request, env, upstreamUrl) {
  validateUpstream(upstreamUrl, env)
  const headers = new Headers()
  for (const name of ['accept', 'range', 'if-none-match', 'if-modified-since', 'icy-metadata']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('User-Agent', 'WorldRadioProxy/1.0')

  const response = await fetchWithValidatedRedirects(upstreamUrl, { method: request.method, headers }, env)
  const finalUrl = response.url || upstreamUrl
  validateUpstream(finalUrl, env)
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const isPlaylist = PLAYLIST_TYPES.some(type => contentType.includes(type)) || /\.m3u8(?:$|\?)/i.test(finalUrl)

  if (request.method === 'GET' && isPlaylist && response.ok) {
    const body = await response.text()
    const rewritten = await rewritePlaylist(body, finalUrl, request.url, env)
    const outputHeaders = responseHeaders(response.headers, request, env)
    outputHeaders.set('Content-Type', 'application/vnd.apple.mpegurl')
    outputHeaders.set('Cache-Control', 'no-store')
    outputHeaders.delete('Content-Length')
    return new Response(rewritten, { status: response.status, headers: outputHeaders })
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response.headers, request, env),
  })
}

async function fetchWithValidatedRedirects(upstreamUrl, init, env) {
  let currentUrl = upstreamUrl
  for (let redirects = 0; redirects <= 5; redirects++) {
    validateUpstream(currentUrl, env)
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (redirects === 5) throw new Error('Too many upstream redirects')
    currentUrl = new URL(location, currentUrl).toString()
  }
  throw new Error('Too many upstream redirects')
}

export async function rewritePlaylist(text, baseUrl, requestUrl, env) {
  const expires = String(Math.floor(Date.now() / 1000) + 60 * 60)
  const workerOrigin = new URL(requestUrl).origin
  const rewrite = async value => {
    const absolute = new URL(value, baseUrl).toString()
    validateUpstream(absolute, env)
    const sig = await signResource(absolute, expires, env)
    return `${workerOrigin}/resource?url=${encodeURIComponent(absolute)}&expires=${expires}&sig=${encodeURIComponent(sig)}`
  }

  const lines = await Promise.all(text.split(/\r?\n/).map(async line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      const matches = [...line.matchAll(/URI=("([^"]+)"|'([^']+)')/g)]
      let output = line
      for (const match of matches.reverse()) {
        const original = match[2] || match[3]
        const replacement = `URI="${await rewrite(original)}"`
        output = output.slice(0, match.index) + replacement + output.slice(match.index + match[0].length)
      }
      return output
    }
    return rewrite(trimmed)
  }))
  return lines.join('\n')
}

export function validateUpstream(rawUrl, env = {}) {
  let url
  try { url = new URL(rawUrl) } catch { throw new Error('Invalid upstream URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported upstream protocol')
  if (url.username || url.password) throw new Error('Upstream credentials are not allowed')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (isPrivateHostname(hostname)) throw new Error('Private upstream address is not allowed')
  const ports = new Set((env.ALLOWED_STREAM_PORTS || '').split(',').map(x => x.trim()).filter(Boolean))
  const allowedPorts = ports.size ? ports : DEFAULT_ALLOWED_PORTS
  const effectivePort = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (!allowedPorts.has(effectivePort)) throw new Error('Upstream port is not allowed')
  return url
}

export function isPrivateHostname(hostname) {
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true
  if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) return true
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const [a, b, c, d] = match.slice(1).map(Number)
  if ([a, b, c, d].some(x => x > 255)) return true
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
}

async function signResource(url, expires, env) {
  if (!env.STREAM_PROXY_SECRET) throw new Error('STREAM_PROXY_SECRET is not configured')
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.STREAM_PROXY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${expires}\n${url}`))
  return toBase64Url(new Uint8Array(signature))
}

async function verifyResource(url, expires, signature, env) {
  const expiresAt = Number(expires)
  if (!url || !signature || !Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000 || expiresAt > Date.now() / 1000 + 7200) return false
  const expected = await signResource(url, expires, env)
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return mismatch === 0
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function responseHeaders(upstream, request, env) {
  const headers = new Headers()
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified', 'icy-br', 'icy-description', 'icy-genre', 'icy-name', 'icy-url']) {
    const value = upstream.get(name)
    if (value) headers.set(name, value)
  }
  addCors(headers, request, env)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
  if (!allowed.length) return ''
  if (!origin) return allowed[0] || '*'
  if (allowed.includes('*') || allowed.includes(origin)) return origin
  return ''
}

function isAllowedOrigin(request, env) { return Boolean(allowedOrigin(request, env)) }

function addCors(headers, request, env) {
  const origin = allowedOrigin(request, env)
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Icy-Br, Icy-Description, Icy-Genre, Icy-Name, Icy-Url')
  headers.append('Vary', 'Origin')
}

function preflight(request, env) {
  if (!isAllowedOrigin(request, env)) return corsJson(request, env, { error: 'Origin not allowed' }, 403)
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since, Icy-Metadata',
    'Access-Control-Max-Age': '86400',
  })
  addCors(headers, request, env)
  return new Response(null, { status: 204, headers })
}

function corsJson(request, env, body, status = 200) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
  addCors(headers, request, env)
  return new Response(JSON.stringify(body), { status, headers })
}

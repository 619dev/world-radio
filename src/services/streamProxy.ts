import type { Station } from '../types'

const proxyOrigin = (import.meta.env.VITE_STREAM_PROXY_URL || '').replace(/\/$/, '')

function needsProxy(station: Station) {
  const url = new URL(station.streamUrl)
  const usesHttpOnHttpsPage = location.protocol === 'https:' && url.protocol === 'http:'
  // Browsers and privacy extensions commonly block radio streams served from
  // uncommon HTTPS ports (for example Pirate Rock on :8101). Route those
  // through the same HTTPS endpoint that already handles mixed-content audio.
  const usesNonStandardHttpsPort = url.protocol === 'https:' && Boolean(url.port) && url.port !== '443'
  return usesHttpOnHttpsPage || usesNonStandardHttpsPort
}

export function playbackUrl(station: Station) {
  if (!needsProxy(station)) return station.streamUrl
  if (!proxyOrigin) {
    if (station.streamUrl.startsWith('http:')) throw new Error('该电台仅支持 HTTP，请先配置音频中继地址')
    return station.streamUrl
  }
  return `${proxyOrigin}/station/${encodeURIComponent(station.id)}`
}

export function isProxiedStation(station: Station) {
  return needsProxy(station) && Boolean(proxyOrigin)
}

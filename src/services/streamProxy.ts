import type { Station } from '../types'

const proxyOrigin = (import.meta.env.VITE_STREAM_PROXY_URL || '').replace(/\/$/, '')

export function playbackUrl(station: Station) {
  if (!station.streamUrl.startsWith('http:')) return station.streamUrl
  if (location.protocol !== 'https:') return station.streamUrl
  if (!proxyOrigin) throw new Error('该电台仅支持 HTTP，请先配置音频中继地址')
  return `${proxyOrigin}/station/${encodeURIComponent(station.id)}`
}

export function isProxiedStation(station: Station) {
  return location.protocol === 'https:' && station.streamUrl.startsWith('http:') && Boolean(proxyOrigin)
}

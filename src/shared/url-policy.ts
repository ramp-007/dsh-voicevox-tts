/** VOICEVOX の接続先 URL の安全性判定。既定はループバックのみ。 */

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string }

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(hostname)
}

/** リンクローカル（クラウドのメタデータ等）。リモート許可でも常に拒否する。 */
function isBlockedRemote(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return /^169\.254\./.test(h) || h.startsWith('[fe80:') || h === '0.0.0.0' || h === '[::]'
}

/**
 * - ループバックは http/https とも可。
 * - それ以外は allowRemote が true かつ https のときだけ可。
 * - 認証情報つき URL・http/https 以外・リンクローカルは常に拒否。
 */
export function checkEngineUrl(raw: string, allowRemote: boolean): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'unsupported-protocol' }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'credentials-not-allowed' }
  if (isBlockedRemote(url.hostname)) return { ok: false, reason: 'blocked-host' }
  if (isLoopbackHost(url.hostname)) return { ok: true, url }
  if (!allowRemote) return { ok: false, reason: 'remote-not-allowed' }
  if (url.protocol !== 'https:') return { ok: false, reason: 'remote-requires-https' }
  return { ok: true, url }
}

/** 末尾スラッシュ・クエリ・ハッシュを落としたベース URL 文字列。 */
export function baseOf(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
}

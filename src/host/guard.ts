/**
 * 中継ルートの来訪者チェック。webServer.register で登録したルートは DSH の /api 認証の対象外なので、
 * 悪意あるウェブページからの cross-site リクエストをここで拒否する。
 */
import type { IncomingMessage } from 'node:http'
import { isLoopbackHost } from '../shared/url-policy.ts'

/**
 * DSH が `--trusted-host` で受け入れるホスト（Tailscale 経由の公開など）を引数から読む。
 * 環境変数 DSH_VOICEVOX_TRUSTED_HOSTS（カンマ区切り）でも追加できる。
 */
export function trustedHostsFrom(argv: readonly string[], env: NodeJS.ProcessEnv): Set<string> {
  const out = new Set<string>()
  argv.forEach((arg, i) => {
    if (arg === '--trusted-host' && argv[i + 1]) out.add(argv[i + 1] as string)
    else if (arg.startsWith('--trusted-host=')) out.add(arg.slice('--trusted-host='.length))
  })
  for (const h of (env['DSH_VOICEVOX_TRUSTED_HOSTS'] ?? '').split(',')) if (h.trim()) out.add(h.trim())
  return out
}

export type GuardResult = { ok: true } | { ok: false; status: number; error: string }

function headerOf(req: Pick<IncomingMessage, 'headers'>, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

export function checkRequest(
  req: Pick<IncomingMessage, 'headers' | 'method'>,
  trusted: ReadonlySet<string> = new Set(),
): GuardResult {
  if (headerOf(req, 'sec-fetch-site') === 'cross-site') return { ok: false, status: 403, error: 'cross-site request rejected' }
  const origin = headerOf(req, 'origin')
  if (origin !== undefined) {
    let host: URL
    try {
      host = new URL(origin)
    } catch {
      return { ok: false, status: 403, error: 'invalid origin' }
    }
    if (!isLoopbackHost(host.hostname) && !trusted.has(host.host)) return { ok: false, status: 403, error: 'origin is not loopback or trusted' }
    if (host.host !== headerOf(req, 'host')) return { ok: false, status: 403, error: 'origin does not match host' }
  }
  if (req.method === 'POST' && !(headerOf(req, 'content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, error: 'content-type must be application/json' }
  }
  return { ok: true }
}

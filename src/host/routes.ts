/** 中継ルートのハンドラ。任意パスの素通しはせず、決まった 4 操作だけを公開する。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { validateSettings } from '../shared/settings.ts'
import { checkEngineUrl, baseOf } from '../shared/url-policy.ts'
import { ProviderError, VoicevoxProvider } from '../voicevox/provider.ts'
import type { ConfigStore } from './config-store.ts'
import { checkRequest, trustedHostsFrom } from './guard.ts'

export const ROUTE_PREFIX = '/dsh-voicevox-api'
const MAX_BODY = 64 * 1024
const MAX_TEXT = 2000

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(json)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new RangeError('body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function statusOf(error: unknown): { status: number; message: string } {
  if (error instanceof ProviderError) {
    const status = error.code === 'timeout' ? 504 : error.code === 'http' ? 502 : error.code === 'unreachable' ? 503 : 502
    return { status, message: `${error.code}: ${error.message}` }
  }
  if (error instanceof RangeError) return { status: 413, message: error.message }
  if (error instanceof SyntaxError) return { status: 400, message: 'invalid JSON' }
  return { status: 500, message: 'internal error' }
}

export function createHandler(
  store: ConfigStore,
  fetchImpl?: typeof fetch,
  trusted: ReadonlySet<string> = trustedHostsFrom(process.argv, process.env),
) {
  const providerFor = (): VoicevoxProvider => {
    const s = store.get()
    const policy = checkEngineUrl(s.engineUrl, s.allowRemote)
    if (!policy.ok) throw new ProviderError('unreachable', `engine URL rejected: ${policy.reason}`)
    return new VoicevoxProvider({ baseUrl: baseOf(policy.url), ...(fetchImpl ? { fetchImpl } : {}) })
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const guard = checkRequest(req, trusted)
    if (!guard.ok) return send(res, guard.status, { error: guard.error })
    const path = (req.url ?? '').split('?')[0]?.slice(ROUTE_PREFIX.length) ?? ''
    try {
      if (path === '/settings' && req.method === 'GET') return send(res, 200, store.get())
      if (path === '/settings' && req.method === 'POST') {
        const r = validateSettings(await readJson(req), store.get())
        if (!r.ok) return send(res, 400, { errors: r.errors })
        const policy = checkEngineUrl(r.value.engineUrl, r.value.allowRemote)
        if (!policy.ok) return send(res, 400, { errors: [`engineUrl: ${policy.reason}`] })
        await store.save(r.value)
        return send(res, 200, { settings: r.value })
      }
      if (path === '/status' && req.method === 'GET') {
        const provider = providerFor()
        const [version, speakers] = await Promise.all([provider.version(), provider.speakers()])
        return send(res, 200, { version, speakers })
      }
      if (path === '/synthesize' && req.method === 'POST') {
        const body = (await readJson(req)) as { text?: unknown; speakerId?: unknown }
        if (typeof body.text !== 'string' || body.text.trim() === '' || body.text.length > MAX_TEXT) {
          return send(res, 400, { error: `text must be 1-${MAX_TEXT} characters` })
        }
        const s = store.get()
        const speakerId = Number.isInteger(body.speakerId) && (body.speakerId as number) >= 0 ? (body.speakerId as number) : s.speakerId
        const wav = await providerFor().synthesize(body.text, { ...s, speakerId })
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' })
        res.end(wav)
        return
      }
      send(res, 404, { error: 'not found' })
    } catch (error) {
      const { status, message } = statusOf(error)
      if (!res.headersSent) send(res, status, { error: message })
      else res.end()
    }
  }
}

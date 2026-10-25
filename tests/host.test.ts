import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConfigStore } from '../src/host/config-store.ts'
import { checkRequest } from '../src/host/guard.ts'
import { createHandler, ROUTE_PREFIX } from '../src/host/routes.ts'
import { DEFAULT_SETTINGS } from '../src/shared/settings.ts'
import { ProviderError, VoicevoxProvider } from '../src/voicevox/provider.ts'

/** VOICEVOX Engine のモック。 */
function mockEngine(): Promise<{ server: Server; url: string; calls: string[] }> {
  const calls: string[] = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    calls.push(`${req.method} ${req.url}`)
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/version') return void res.end('"0.99.0"')
    if (url.pathname === '/speakers') {
      res.setHeader('content-type', 'application/json')
      return void res.end(JSON.stringify([{ name: '四国めたん', speaker_uuid: 'u', styles: [{ id: 2, name: 'ノーマル' }] }]))
    }
    if (url.pathname === '/audio_query') {
      res.setHeader('content-type', 'application/json')
      return void res.end(JSON.stringify({ speedScale: 1, pitchScale: 0, intonationScale: 1, volumeScale: 1, text: url.searchParams.get('text') }))
    }
    if (url.pathname === '/synthesis') {
      let body = ''
      for await (const c of req) body += c
      calls.push(`BODY ${body}`)
      return void res.end(Buffer.from('RIFFwav'))
    }
    res.statusCode = 404
    res.end()
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls })
  }))
}

describe('VoicevoxProvider', () => {
  let engine: Awaited<ReturnType<typeof mockEngine>>
  beforeAll(async () => { engine = await mockEngine() })
  afterAll(() => { engine.server.close() })

  it('version / speakers / synthesize（パラメータ反映）', async () => {
    const p = new VoicevoxProvider({ baseUrl: engine.url })
    expect(await p.version()).toBe('0.99.0')
    expect((await p.speakers())[0]?.styles[0]?.id).toBe(2)
    const wav = await p.synthesize('こんにちは', { speakerId: 2, speedScale: 1.5, pitchScale: 0.1, intonationScale: 0.5, volumeScale: 0.8 })
    expect(Buffer.from(wav).toString()).toBe('RIFFwav')
    const body = engine.calls.find((c) => c.startsWith('BODY '))
    expect(JSON.parse(body?.slice(5) ?? '{}')).toMatchObject({ speedScale: 1.5, pitchScale: 0.1, intonationScale: 0.5, volumeScale: 0.8 })
  })
  it('停止している Engine は unreachable', async () => {
    const p = new VoicevoxProvider({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 2000 })
    await expect(p.version()).rejects.toMatchObject({ code: 'unreachable' })
  })
  it('応答が遅ければ timeout', async () => {
    const slow = createServer(() => { /* 応答しない */ })
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r))
    const p = new VoicevoxProvider({ baseUrl: `http://127.0.0.1:${(slow.address() as AddressInfo).port}`, timeoutMs: 100 })
    await expect(p.version()).rejects.toMatchObject({ code: 'timeout' })
    slow.closeAllConnections()
    slow.close()
  })
  it('中断シグナルは aborted', async () => {
    const slow = createServer(() => {})
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r))
    const ac = new AbortController()
    const p = new VoicevoxProvider({ baseUrl: `http://127.0.0.1:${(slow.address() as AddressInfo).port}`, timeoutMs: 5000 })
    const pending = p.version(ac.signal)
    ac.abort()
    await expect(pending).rejects.toBeInstanceOf(ProviderError)
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    slow.closeAllConnections()
    slow.close()
  })
})

describe('checkRequest（来訪者ガード）', () => {
  const req = (headers: Record<string, string>, method = 'GET') => ({ headers, method })
  it('同一オリジン・Origin なしは許可', () => {
    expect(checkRequest(req({ host: '127.0.0.1:3080' })).ok).toBe(true)
    expect(checkRequest(req({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' })).ok).toBe(true)
  })
  it('外部オリジン・cross-site・ポート違いを拒否', () => {
    expect(checkRequest(req({ host: '127.0.0.1:3080', origin: 'https://evil.example' })).ok).toBe(false)
    expect(checkRequest(req({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' })).ok).toBe(false)
    expect(checkRequest(req({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:9999' })).ok).toBe(false)
    expect(checkRequest(req({ host: '127.0.0.1:3080', origin: 'null' })).ok).toBe(false)
  })
  it('POST は JSON のみ', () => {
    expect(checkRequest(req({ host: 'h', 'content-type': 'text/plain' }, 'POST')).ok).toBe(false)
    expect(checkRequest(req({ host: 'h', 'content-type': 'application/json' }, 'POST')).ok).toBe(true)
  })
})

describe('ConfigStore（設定の保存と復元）', () => {
  it('保存した内容を再起動後に復元する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dvt-'))
    const file = join(dir, 'sub', 'settings.json')
    const a = new ConfigStore(file)
    await a.save({ ...DEFAULT_SETTINGS, autoRead: true, speakerId: 3 })
    const b = new ConfigStore(file)
    await b.load()
    expect(b.get()).toMatchObject({ autoRead: true, speakerId: 3 })
    await rm(dir, { recursive: true, force: true })
  })
  it('壊れたファイルは初期値で起動する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dvt-'))
    const file = join(dir, 'settings.json')
    await writeFile(file, '{broken', 'utf8')
    const s = new ConfigStore(file)
    await s.load()
    expect(s.get()).toEqual(DEFAULT_SETTINGS)
    expect(await readFile(file, 'utf8')).toBe('{broken')
    await rm(dir, { recursive: true, force: true })
  })
})

describe('中継ルート（統合）', () => {
  let engine: Awaited<ReturnType<typeof mockEngine>>
  let api: Server
  let port: number
  let dir: string
  let store: ConfigStore

  beforeAll(async () => {
    engine = await mockEngine()
    dir = await mkdtemp(join(tmpdir(), 'dvt-'))
    store = new ConfigStore(join(dir, 'settings.json'))
    await store.save({ ...DEFAULT_SETTINGS, engineUrl: engine.url })
    const handle = createHandler(store)
    api = createServer((req, res) => void handle(req, res))
    await new Promise<void>((r) => api.listen(0, '127.0.0.1', r))
    port = (api.address() as AddressInfo).port
  })
  afterAll(async () => {
    api.close()
    engine.server.close()
    await rm(dir, { recursive: true, force: true })
  })

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body)
      const r = request({ host: '127.0.0.1', port, method, path: ROUTE_PREFIX + path, headers: {
        ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
      })
      r.on('error', reject)
      r.end(data)
    })

  it('status：接続成功で version と話者一覧', async () => {
    const r = await call('GET', '/status')
    expect(r.status).toBe(200)
    const j = JSON.parse(r.body.toString()) as { version: string; speakers: { name: string }[] }
    expect(j.version).toBe('0.99.0')
    expect(j.speakers[0]?.name).toBe('四国めたん')
  })
  it('synthesize：WAV を返す', async () => {
    const r = await call('POST', '/synthesize', { text: 'テスト', speakerId: 2 })
    expect(r.status).toBe(200)
    expect(r.body.toString()).toBe('RIFFwav')
  })
  it('synthesize：空・長すぎるテキストは 400', async () => {
    expect((await call('POST', '/synthesize', { text: '  ' })).status).toBe(400)
    expect((await call('POST', '/synthesize', { text: 'あ'.repeat(2001) })).status).toBe(400)
  })
  it('settings：不正値は 400 で保存されない、正常値は保存される', async () => {
    expect((await call('POST', '/settings', { speedScale: 9 })).status).toBe(400)
    expect(store.get().speedScale).toBe(1)
    const ok = await call('POST', '/settings', { speedScale: 1.2 })
    expect(ok.status).toBe(200)
    expect(store.get().speedScale).toBe(1.2)
  })
  it('settings：リモート URL は allowRemote なしでは保存できない', async () => {
    const r = await call('POST', '/settings', { engineUrl: 'http://example.com:50021' })
    expect(r.status).toBe(400)
    expect(store.get().engineUrl).toBe(engine.url)
  })
  it('外部オリジンからのリクエストは 403（Engine には届かない）', async () => {
    const before = engine.calls.length
    const r = await call('POST', '/synthesize', { text: 'x' }, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
    expect(engine.calls.length).toBe(before)
  })
  it('任意パスは 404', async () => {
    expect((await call('GET', '/../etc/passwd')).status).toBe(404)
  })
  it('Engine 停止時は 503 を返し、サーバーは落ちない', async () => {
    const saved = store.get()
    await store.save({ ...saved, engineUrl: 'http://127.0.0.1:1' })
    expect((await call('GET', '/status')).status).toBe(503)
    expect((await call('GET', '/settings')).status).toBe(200)
    await store.save(saved)
  })
})

describe('trusted host（Tailscale 等の公開 URL）', () => {
  const req = (headers: Record<string, string>) => ({ headers, method: 'GET' })
  it('--trusted-host で指定したホストの同一オリジンを許可する', async () => {
    const { trustedHostsFrom } = await import('../src/host/guard.ts')
    const trusted = trustedHostsFrom(['dsh', '--trusted-host', 'dsh.example.test:8444'], {})
    const h = { host: 'dsh.example.test:8444', origin: 'https://dsh.example.test:8444' }
    expect(checkRequest(req(h), trusted).ok).toBe(true)
    expect(checkRequest(req(h)).ok).toBe(false)
    expect(checkRequest(req({ ...h, origin: 'https://evil.example' }), trusted).ok).toBe(false)
  })
})

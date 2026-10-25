/** VOICEVOX Engine の HTTP API クライアント。Node とブラウザの両方で動く（fetch のみ使用）。 */
import { parseSpeakers, type Speaker } from './speakers.ts'

export type ProviderErrorCode = 'unreachable' | 'timeout' | 'http' | 'aborted' | 'bad-response'

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface SynthesisParams {
  speakerId: number
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
}

export interface ProviderOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  /** 1 リクエストあたりのタイムアウト(ms)。 */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

export class VoicevoxProvider {
  private readonly base: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ProviderOptions) {
    this.base = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let res: Response
    try {
      res = await this.fetchImpl(this.base + path, { ...init, signal: combined })
    } catch (error) {
      if (signal?.aborted) throw new ProviderError('aborted', 'request aborted')
      if (timeout.aborted) throw new ProviderError('timeout', `request timed out after ${this.timeoutMs}ms`)
      throw new ProviderError('unreachable', error instanceof Error ? error.message : 'network error')
    }
    if (!res.ok) throw new ProviderError('http', `VOICEVOX responded with HTTP ${res.status}`, res.status)
    return res
  }

  async version(signal?: AbortSignal): Promise<string> {
    const res = await this.request('/version', { method: 'GET' }, signal)
    const text = (await res.text()).trim()
    return text.replace(/^"|"$/g, '')
  }

  async speakers(signal?: AbortSignal): Promise<Speaker[]> {
    const res = await this.request('/speakers', { method: 'GET' }, signal)
    try {
      return parseSpeakers(await res.json())
    } catch (error) {
      throw new ProviderError('bad-response', error instanceof Error ? error.message : 'invalid speakers response')
    }
  }

  /** audio_query → パラメータ反映 → synthesis。WAV のバイト列を返す。 */
  async synthesize(text: string, params: SynthesisParams, signal?: AbortSignal): Promise<Uint8Array> {
    const q = await this.request(
      `/audio_query?speaker=${encodeURIComponent(String(params.speakerId))}&text=${encodeURIComponent(text)}`,
      { method: 'POST' },
      signal,
    )
    let query: Record<string, unknown>
    try {
      query = (await q.json()) as Record<string, unknown>
    } catch {
      throw new ProviderError('bad-response', 'audio_query returned invalid JSON')
    }
    query['speedScale'] = params.speedScale
    query['pitchScale'] = params.pitchScale
    query['intonationScale'] = params.intonationScale
    query['volumeScale'] = params.volumeScale
    const s = await this.request(
      `/synthesis?speaker=${encodeURIComponent(String(params.speakerId))}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) },
      signal,
    )
    return new Uint8Array(await s.arrayBuffer())
  }
}

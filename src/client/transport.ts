/** ブラウザ→VOICEVOX の経路。Host 中継ルートを優先し、無ければ（Desktop 等）直接接続に切り替える。 */
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../shared/settings.ts'
import { checkEngineUrl, baseOf } from '../shared/url-policy.ts'
import { VoicevoxProvider } from '../voicevox/provider.ts'
import { parseSpeakers, type Speaker } from '../voicevox/speakers.ts'
import type { Synthesizer } from './synthesis-queue.ts'

export const API_BASE = '/dsh-voicevox-api'
const LS_KEY = 'dsh-voicevox-tts:settings'

export interface ConnectionInfo {
  version: string
  speakers: Speaker[]
}

export type Mode = 'host' | 'direct'

export type SaveResult = { ok: true } | { ok: false; errors: string[] }

function readLocal(): Settings {
  try {
    const r = validateSettings(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'))
    if (r.ok) return r.value
  } catch {
    // localStorage が使えない環境では初期値を使う
  }
  return DEFAULT_SETTINGS
}

function writeLocal(s: Settings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    // 保存できなくても動作は続ける
  }
}

export class Transport {
  mode: Mode = 'host'
  settings: Settings = readLocal()

  /** Host の設定を読み込む。ルートが無ければ直接接続モードに切り替える。 */
  async load(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/settings`)
      if (!res.ok) throw new Error(String(res.status))
      const r = validateSettings(await res.json())
      if (r.ok) {
        this.settings = r.value
        writeLocal(r.value)
      }
      this.mode = 'host'
    } catch {
      this.mode = 'direct'
      this.settings = readLocal()
    }
  }

  async save(next: Settings): Promise<SaveResult> {
    if (this.mode === 'host') {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const body = (await res.json()) as { errors?: string[]; settings?: unknown }
      if (!res.ok) return { ok: false, errors: body.errors ?? [`HTTP ${res.status}`] }
      const r = validateSettings(body.settings)
      if (r.ok) next = r.value
    } else {
      const policy = checkEngineUrl(next.engineUrl, next.allowRemote)
      if (!policy.ok) return { ok: false, errors: [policy.reason] }
    }
    this.settings = next
    writeLocal(next)
    return { ok: true }
  }

  private direct(settings: Settings): VoicevoxProvider {
    const policy = checkEngineUrl(settings.engineUrl, settings.allowRemote)
    if (!policy.ok) throw new Error(policy.reason)
    return new VoicevoxProvider({ baseUrl: baseOf(policy.url) })
  }

  async connect(signal?: AbortSignal): Promise<ConnectionInfo> {
    if (this.mode === 'host') {
      const res = await fetch(`${API_BASE}/status`, signal ? { signal } : {})
      const body = (await res.json()) as { error?: string; version?: string; speakers?: unknown }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return { version: body.version ?? '', speakers: parseSpeakers(body.speakers) }
    }
    const p = this.direct(this.settings)
    return { version: await p.version(signal), speakers: await p.speakers(signal) }
  }

  makeSynthesizer = (settings: Settings): Synthesizer => {
    if (this.mode === 'host') {
      return async (text, signal) => {
        const res = await fetch(`${API_BASE}/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal,
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return new Blob([await res.arrayBuffer()], { type: 'audio/wav' })
      }
    }
    const provider = this.direct(settings)
    return async (text, signal) => new Blob([(await provider.synthesize(text, settings, signal)) as BlobPart], { type: 'audio/wav' })
  }
}

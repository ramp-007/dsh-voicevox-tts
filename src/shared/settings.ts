/** 設定の型・初期値・検証。ホストとブラウザの両方から使う。 */

export interface Settings {
  autoRead: boolean
  engineUrl: string
  allowRemote: boolean
  speakerId: number
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
  readCodeBlocks: boolean
  showConnectionStatus: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  autoRead: false,
  engineUrl: 'http://127.0.0.1:50021',
  allowRemote: false,
  speakerId: 2,
  speedScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  volumeScale: 1.0,
  readCodeBlocks: false,
  showConnectionStatus: true,
}

/** 数値範囲。Engine の API 仕様は speed>0・volume>=0 のみ制約で上限なし（実測）。実用域に絞っている。 */
export const RANGES = {
  speedScale: { min: 0.1, max: 5.0 },
  pitchScale: { min: -0.5, max: 0.5 },
  intonationScale: { min: 0.0, max: 3.0 },
  volumeScale: { min: 0.0, max: 3.0 },
} as const

export type SettingsResult =
  | { ok: true; value: Settings }
  | { ok: false; errors: string[] }

const BOOLEAN_KEYS = ['autoRead', 'allowRemote', 'readCodeBlocks', 'showConnectionStatus'] as const
const RANGE_KEYS = ['speedScale', 'pitchScale', 'intonationScale', 'volumeScale'] as const

/** 未知のキーは無視し、不正な値は errors に集めて拒否する。欠けたキーは初期値で補う。 */
export function validateSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): SettingsResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['settings must be an object'] }
  }
  const src = input as Record<string, unknown>
  const next: Settings = { ...base }
  const errors: string[] = []

  for (const key of BOOLEAN_KEYS) {
    if (!(key in src)) continue
    if (typeof src[key] !== 'boolean') errors.push(`${key} must be a boolean`)
    else next[key] = src[key]
  }
  for (const key of RANGE_KEYS) {
    if (!(key in src)) continue
    const v = src[key]
    const { min, max } = RANGES[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      errors.push(`${key} must be a number between ${min} and ${max}`)
    } else next[key] = v
  }
  if ('speakerId' in src) {
    const v = src['speakerId']
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) errors.push('speakerId must be a non-negative integer')
    else next.speakerId = v
  }
  if ('engineUrl' in src) {
    const v = src['engineUrl']
    if (typeof v !== 'string' || v.length === 0 || v.length > 2048) errors.push('engineUrl must be a non-empty string')
    else next.engineUrl = v.trim()
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: next }
}

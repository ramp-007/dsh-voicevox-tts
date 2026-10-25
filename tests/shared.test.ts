import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, validateSettings } from '../src/shared/settings.ts'
import { checkEngineUrl } from '../src/shared/url-policy.ts'
import { findStyle, parseSpeakers } from '../src/voicevox/speakers.ts'

describe('validateSettings', () => {
  it('初期値は仕様どおり', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      autoRead: false, engineUrl: 'http://127.0.0.1:50021', speakerId: 2,
      speedScale: 1, pitchScale: 0, intonationScale: 1, volumeScale: 1,
      readCodeBlocks: false, showConnectionStatus: true, allowRemote: false,
    })
  })
  it('一部だけ渡すと残りは基準値で補う', () => {
    const r = validateSettings({ autoRead: true })
    expect(r).toEqual({ ok: true, value: { ...DEFAULT_SETTINGS, autoRead: true } })
  })
  it.each([
    [{ speedScale: 6 }], [{ speedScale: 0 }], [{ pitchScale: 0.6 }], [{ intonationScale: -1 }],
    [{ volumeScale: 4 }], [{ speedScale: Number.NaN }], [{ speakerId: 1.5 }], [{ speakerId: -1 }],
    [{ autoRead: 'yes' }], [{ engineUrl: '' }], [{ engineUrl: 42 }],
  ])('不正な値を拒否する %j', (input) => {
    expect(validateSettings(input).ok).toBe(false)
  })
  it('オブジェクト以外を拒否し、未知のキーは取り込まない', () => {
    expect(validateSettings(null).ok).toBe(false)
    expect(validateSettings([]).ok).toBe(false)
    const r = validateSettings({ evil: 1 })
    expect(r.ok && 'evil' in r.value).toBe(false)
  })
})

describe('checkEngineUrl', () => {
  it('ループバックは許可', () => {
    for (const u of ['http://127.0.0.1:50021', 'http://localhost:50021', 'http://[::1]:50021']) {
      expect(checkEngineUrl(u, false).ok).toBe(true)
    }
  })
  it('リモートは既定で拒否、許可しても https のみ', () => {
    expect(checkEngineUrl('http://voice.example.com:50021', false)).toEqual({ ok: false, reason: 'remote-not-allowed' })
    expect(checkEngineUrl('http://voice.example.com', true)).toEqual({ ok: false, reason: 'remote-requires-https' })
    expect(checkEngineUrl('https://voice.example.com', true).ok).toBe(true)
  })
  it('認証情報・非http・メタデータ宛を常に拒否', () => {
    expect(checkEngineUrl('http://user:pw@127.0.0.1', true).ok).toBe(false)
    expect(checkEngineUrl('file:///etc/passwd', true).ok).toBe(false)
    expect(checkEngineUrl('https://169.254.169.254', true)).toEqual({ ok: false, reason: 'blocked-host' })
    expect(checkEngineUrl('not a url', true).ok).toBe(false)
  })
})

describe('parseSpeakers', () => {
  const sample = [
    { name: '四国めたん', speaker_uuid: 'u1', styles: [{ id: 2, name: 'ノーマル' }, { id: 0, name: 'あまあま' }] },
    { name: '壊れた', styles: 'x' },
    { name: 'スタイル無し', styles: [] },
    'junk',
  ]
  it('有効な話者だけ取り出す', () => {
    const sp = parseSpeakers(sample)
    expect(sp).toHaveLength(1)
    expect(sp[0]?.styles.map((s) => s.id)).toEqual([2, 0])
  })
  it('配列でなければ例外', () => {
    expect(() => parseSpeakers({})).toThrow()
  })
  it('スタイル ID の存在を検証できる', () => {
    const sp = parseSpeakers(sample)
    expect(findStyle(sp, 2)?.speaker.name).toBe('四国めたん')
    expect(findStyle(sp, 999)).toBeUndefined()
  })
})

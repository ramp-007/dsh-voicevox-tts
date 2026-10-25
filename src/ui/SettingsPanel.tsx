/** 設定タブ：接続確認・話者選択・各種パラメータ・試聴。 */
import * as React from 'react'
import { controller, ready, transport } from '../client/runtime.ts'
import { RANGES, type Settings } from '../shared/settings.ts'
import { creditFor, findStyle, type Speaker } from '../voicevox/speakers.ts'
import { t } from './i18n.ts'

type Conn = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok'; version: string } | { kind: 'error'; message: string }

const h = React.createElement
const PREVIEW_TEXT = 'こんにちは。この声で回答を読み上げます。'

function slider(label: string, key: keyof typeof RANGES, value: number, onChange: (v: number) => void) {
  const { min, max } = RANGES[key]
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return h('div', { className: 'dvt-row', key },
    h('label', null, `${label}（${min}〜${max}）`),
    h('div', { className: 'dvt-inline' },
      h('input', {
        type: 'range', min, max, step: 0.01, value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
      }),
      h('input', {
        type: 'number', className: 'dvt-num', min, max, step: 0.01, value: Number(value.toFixed(2)),
        'aria-label': label,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const v = e.target.valueAsNumber
          if (Number.isFinite(v)) onChange(clamp(v))
        },
      }),
    ),
  )
}

function check(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return h('label', { className: 'dvt-inline', key: label },
    h('input', { type: 'checkbox', checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) }),
    label,
  )
}

export function SettingsPanel(): React.ReactElement {
  const [settings, setSettings] = React.useState<Settings>(transport.settings)
  const [conn, setConn] = React.useState<Conn>({ kind: 'idle' })
  const [speakers, setSpeakers] = React.useState<Speaker[]>([])
  const [message, setMessage] = React.useState<string>('')

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }))

  const connect = React.useCallback(async () => {
    setConn({ kind: 'checking' })
    try {
      const info = await transport.connect()
      setSpeakers(info.speakers)
      setConn({ kind: 'ok', version: info.version })
    } catch (error) {
      setConn({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  React.useEffect(() => {
    void (async () => {
      await ready
      setSettings(transport.settings)
      await connect()
    })()
  }, [connect])

  const found = findStyle(speakers, settings.speakerId)
  const missing = conn.kind === 'ok' && speakers.length > 0 && !found
  const current = found?.speaker ?? speakers[0]

  const save = async () => {
    const r = await transport.save(settings)
    setMessage(r.ok ? t('saved') : r.errors.join(' / '))
    if (r.ok) void connect()
  }

  const preview = async () => {
    await transport.save(settings)
    void controller.speak('preview', PREVIEW_TEXT)
  }

  const status =
    conn.kind === 'ok' ? h('span', { className: 'dvt-ok' }, t('connected', { version: conn.version }))
    : conn.kind === 'error' ? h('span', { className: 'dvt-err' }, t('disconnected', { error: conn.message }))
    : conn.kind === 'checking' ? t('checking')
    : t('hintStart')

  return h('div', { className: 'dvt-panel' },
    check(t('autoRead'), settings.autoRead, (v) => update('autoRead', v)),
    h('div', { className: 'dvt-row' },
      h('label', null, t('engineUrl')),
      h('input', { type: 'text', value: settings.engineUrl, onChange: (e: React.ChangeEvent<HTMLInputElement>) => update('engineUrl', e.target.value) }),
      check(t('allowRemote'), settings.allowRemote, (v) => update('allowRemote', v)),
    ),
    h('div', { className: 'dvt-inline' },
      h('button', { type: 'button', onClick: () => void connect() }, t('check')),
      settings.showConnectionStatus ? status : null,
    ),
    transport.mode === 'direct' ? h('div', { className: 'dvt-note' }, t('corsHint')) : null,
    missing ? h('div', { className: 'dvt-err', role: 'alert' }, t('missingSpeaker', { id: settings.speakerId })) : null,
    speakers.length > 0
      ? h('div', { className: 'dvt-inline' },
          h('label', null, t('speaker')),
          h('select', {
            value: current?.uuid ?? '',
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
              const sp = speakers.find((x) => x.uuid === e.target.value)
              const first = sp?.styles[0]
              if (first) update('speakerId', first.id)
            },
          }, speakers.map((sp) => h('option', { key: sp.uuid || sp.name, value: sp.uuid }, sp.name))),
          h('label', null, t('style')),
          h('select', {
            value: found ? String(settings.speakerId) : '',
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => update('speakerId', Number(e.target.value)),
          }, (current?.styles ?? []).map((st) => h('option', { key: st.id, value: String(st.id) }, st.name))),
        )
      : null,
    slider(t('speed'), 'speedScale', settings.speedScale, (v) => update('speedScale', v)),
    slider(t('pitch'), 'pitchScale', settings.pitchScale, (v) => update('pitchScale', v)),
    slider(t('intonation'), 'intonationScale', settings.intonationScale, (v) => update('intonationScale', v)),
    slider(t('volume'), 'volumeScale', settings.volumeScale, (v) => update('volumeScale', v)),
    check(t('readCode'), settings.readCodeBlocks, (v) => update('readCodeBlocks', v)),
    check(t('showStatus'), settings.showConnectionStatus, (v) => update('showConnectionStatus', v)),
    h('div', { className: 'dvt-inline' },
      h('button', { type: 'button', onClick: () => void save() }, t('save')),
      h('button', { type: 'button', onClick: () => void preview() }, t('preview')),
      message ? h('span', { className: 'dvt-note', role: 'status' }, message) : null,
    ),
    current ? h('div', { className: 'dvt-note' }, t('credit', { name: creditFor(current).replace('VOICEVOX:', '') })) : h('div', { className: 'dvt-note' }, t('credit', { name: '…' })),
    h('div', { className: 'dvt-note' },
      h('a', { href: 'https://voicevox.hiroshiba.jp/', target: '_blank', rel: 'noopener noreferrer' }, t('terms')),
      ' / ', t('unofficial'),
    ),
  )
}

/** UI 文言（日本語・英語）。ブラウザの言語が ja で始まれば日本語、それ以外は英語。 */

const ja = {
  tab: 'VOICEVOX 読み上げ',
  read: 'この回答を読み上げ',
  stop: '読み上げを停止',
  reading: '読み上げ中',
  progress: '{index}/{total}',
  retry: '読み直す',
  autoRead: '自動読み上げ',
  engineUrl: 'VOICEVOX の URL',
  allowRemote: 'リモート接続を許可（https のみ。通信は暗号化されるが、文章が外部に送られます）',
  speaker: '話者',
  style: 'スタイル',
  speed: '話速',
  pitch: '音高',
  intonation: '抑揚',
  volume: '音量',
  readCode: 'コードブロックも読み上げる',
  showStatus: '接続状態を表示',
  save: '保存',
  saved: '保存しました',
  check: '接続確認',
  preview: '試聴',
  connected: '接続済み（VOICEVOX {version}）',
  disconnected: '未接続：{error}',
  checking: '確認中…',
  hintStart: 'VOICEVOX を起動してから「接続確認」を押してください。',
  missingSpeaker: '保存済みの話者 ID {id} は、この Engine に存在しません。話者を選び直してください。',
  corsHint: '直接接続では VOICEVOX の CORS 設定が必要な場合があります（--cors_policy_mode all）。',
  credit: '音声の利用時は「VOICEVOX:{name}」などのクレジット表記が必要です。各話者の利用規約を確認してください。',
  terms: '利用規約を確認',
  unofficial: '非公式プラグインです。VOICEVOX 公式とは関係ありません。',
} as const

const en: Record<keyof typeof ja, string> = {
  tab: 'VOICEVOX reading',
  read: 'Read this reply aloud',
  stop: 'Stop reading',
  reading: 'Reading',
  progress: '{index}/{total}',
  retry: 'Read again',
  autoRead: 'Auto-read replies',
  engineUrl: 'VOICEVOX URL',
  allowRemote: 'Allow remote connection (https only; your text is sent to that host)',
  speaker: 'Speaker',
  style: 'Style',
  speed: 'Speed',
  pitch: 'Pitch',
  intonation: 'Intonation',
  volume: 'Volume',
  readCode: 'Also read code blocks',
  showStatus: 'Show connection status',
  save: 'Save',
  saved: 'Saved',
  check: 'Check connection',
  preview: 'Preview',
  connected: 'Connected (VOICEVOX {version})',
  disconnected: 'Not connected: {error}',
  checking: 'Checking…',
  hintStart: 'Start VOICEVOX, then press "Check connection".',
  missingSpeaker: 'Saved speaker ID {id} does not exist on this Engine. Please pick a speaker again.',
  corsHint: 'Direct connection may require VOICEVOX CORS settings (--cors_policy_mode all).',
  credit: 'Credit such as "VOICEVOX:<speaker name>" is required when you publish the audio. Check each speaker\'s terms.',
  terms: 'View terms of use',
  unofficial: 'Unofficial plugin. Not affiliated with VOICEVOX.',
}

export type MessageKey = keyof typeof ja

export function pickLocale(language: string): 'ja' | 'en' {
  return /^ja/i.test(language) ? 'ja' : 'en'
}

export function t(key: MessageKey, params: Record<string, string | number> = {}, language?: string): string {
  const lang = pickLocale(language ?? (typeof navigator === 'undefined' ? 'en' : navigator.language))
  const template: string = lang === 'ja' ? ja[key] : en[key]
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

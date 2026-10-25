/** ブラウザ側エントリ。読み上げボタンと設定タブを DSH の UI スロットに登録する。 */
import { ReadAloudButton } from '../ui/ReadAloudButton.tsx'
import { SettingsPanel } from '../ui/SettingsPanel.tsx'
import { t } from '../ui/i18n.ts'
import { ensureStyle } from './runtime.ts'

interface SlotsService {
  inject(key: string, setup: () => () => void): void
  register(entry: Record<string, unknown>, component: unknown): () => void
}

interface ClientContext {
  slots?: SlotsService
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const slots = ctx.slots
  if (!slots) throw new Error('[dsh-voicevox-tts] slots service unavailable')
  ensureStyle()
  slots.inject('conversation.chat.assistant-actions', () =>
    slots.register(
      { name: 'conversation.chat.assistant-actions', key: 'voicevox-read', id: 'voicevox-read', order: 20 },
      ReadAloudButton,
    ),
  )
  slots.inject('settings.plugins.tab', () =>
    slots.register(
      { name: 'settings.plugins.tab', key: 'voicevox-tts', id: 'voicevox-tts', order: 30, label: () => t('tab') },
      SettingsPanel,
    ),
  )
}

/** 各アシスタント回答に付ける読み上げボタン。自動読み上げの起点も兼ねる。 */
import * as React from 'react'
import { findAssistantMessage, isFresh } from '../client/message-text.ts'
import { controller, ready } from '../client/runtime.ts'
import { t } from './i18n.ts'

interface Props {
  messageId: string
  useChat: <T>(selector: (snapshot: never) => T) => T
}

function useTtsState() {
  return React.useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
}

export function ReadAloudButton({ messageId, useChat }: Props): React.ReactElement | null {
  const message = useChat((snapshot) => {
    const found = findAssistantMessage(snapshot as never, messageId)
    return found ? `${found.time}\u0000${found.text}` : ''
  })
  const sep = message.indexOf('\u0000')
  const time = sep > 0 ? Number(message.slice(0, sep)) : 0
  const text = sep >= 0 ? message.slice(sep + 1) : ''
  const state = useTtsState()

  React.useEffect(() => {
    if (text !== '' && isFresh(time)) void ready.then(() => controller.maybeAutoRead(messageId, text))
  }, [messageId, text, time])

  if (text.trim() === '') return null
  const mine = state.messageId === messageId
  const busy = mine && (state.status === 'synthesizing' || state.status === 'playing')
  const label = busy ? t('stop') : mine && state.status === 'error' ? t('retry') : t('read')
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dvt-btn',
        'aria-label': label,
        title: label,
        'data-active': busy,
        onClick: () => controller.toggle(messageId, text),
      },
      busy ? '■' : '🔊',
      busy && state.total > 1 ? t('progress', { index: state.index, total: state.total }) : null,
    ),
    mine && state.status === 'error'
      ? React.createElement('span', { className: 'dvt-err', role: 'alert' }, state.error)
      : null,
  )
}

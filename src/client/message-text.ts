/** チャットのスナップショットから、指定メッセージの最終回答テキスト（text ブロックのみ）を取り出す。 */

export interface FoundMessage {
  text: string
  /** メッセージ確定時刻(ms)。 */
  time: number
}

interface NodeLike {
  kind?: unknown
  data?: {
    finalNode?: { messageId?: unknown; blocks?: unknown; time?: unknown }
  }
}

interface SnapshotLike {
  order: readonly string[]
  nodes: { get(key: string): unknown }
}

/** 思考過程(reasoning)・ツール呼び出しは含めず、text ブロックだけを連結する。 */
export function findAssistantMessage(snapshot: SnapshotLike, messageId: string): FoundMessage | null {
  for (const key of snapshot.order) {
    const node = snapshot.nodes.get(key) as NodeLike | undefined
    if (node?.kind !== 'assistant-step') continue
    const final = node.data?.finalNode
    if (!final || final.messageId !== messageId || !Array.isArray(final.blocks)) continue
    const text = (final.blocks as { kind?: unknown; text?: unknown }[])
      .filter((b) => b.kind === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
    return { text, time: typeof final.time === 'number' ? final.time : 0 }
  }
  return null
}

/** 自動読み上げの対象にする新しさ。履歴の再表示で古い回答を読み上げないための目安。 */
export const AUTO_READ_MAX_AGE_MS = 30_000

export function isFresh(time: number, now: number = Date.now()): boolean {
  return time > 0 && now - time >= -5_000 && now - time <= AUTO_READ_MAX_AGE_MS
}

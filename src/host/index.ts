/** DSH Host 側のエントリ。webServer に中継ルートを登録する。アンロードで自動的に解除される。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ConfigStore } from './config-store.ts'
import { createHandler, ROUTE_PREFIX } from './routes.ts'

/** Cordis の Context のうち、このプラグインが使う部分だけ（本体の型に依存しない）。 */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface HostContext {
  get(name: 'webServer'): WebServerLike | undefined
  effect(setup: () => () => void, label?: string): void
}

export const name = 'dsh-voicevox-tts'
export const inject = ['webServer']

export async function apply(ctx: HostContext): Promise<void> {
  const webServer = ctx.get('webServer')
  if (!webServer) return
  const store = new ConfigStore()
  await store.load()
  const handle = createHandler(store)
  ctx.effect(
    () => webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }),
    'dsh-voicevox-tts: api routes',
  )
}

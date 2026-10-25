/** ブラウザ側の共有インスタンス（1 ページに 1 つ）と、React から状態を読む購読ヘルパー。 */
import { TtsController } from './controller.ts'
import { Player } from './player.ts'
import { Transport } from './transport.ts'

export const transport = new Transport()

export const controller = new TtsController({
  getSettings: () => transport.settings,
  makeSynthesizer: transport.makeSynthesizer,
  player: new Player(),
})

/** Host の設定を一度だけ読み込む。失敗しても直接接続モードで動作を続ける。 */
export const ready: Promise<void> = transport.load()

const STYLE_ID = 'dsh-voicevox-tts-style'

const CSS = `
.dvt-btn{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:inherit;cursor:pointer;padding:4px;border-radius:6px;font-size:12px;opacity:.7}
.dvt-btn:hover,.dvt-btn[data-active="true"]{opacity:1;background:rgba(127,127,127,.15)}
.dvt-err{color:#e5484d;font-size:12px}
.dvt-panel{--dvt-fg:var(--dsw-alias-label-primary,inherit);--dvt-bg:var(--dsw-alias-bg-layer-2,Canvas);--dvt-bd:var(--dsw-alias-border-l2,rgba(127,127,127,.5));display:flex;flex-direction:column;gap:12px;max-width:560px;padding:8px 0;color:var(--dvt-fg)}
.dvt-row{display:flex;flex-direction:column;gap:4px}
.dvt-row label{font-size:13px}
.dvt-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dvt-panel input[type=text],.dvt-panel input[type=number],.dvt-panel select,.dvt-panel select option,.dvt-panel button{background:var(--dvt-bg);color:var(--dvt-fg);border:1px solid var(--dvt-bd);border-radius:6px;padding:4px 8px;font:inherit}
.dvt-panel button{cursor:pointer}
.dvt-num{width:6em}
.dvt-panel button:hover{filter:brightness(1.15)}
.dvt-panel input[type=range]{accent-color:var(--dsw-alias-state-business-primary,#4d8dff)}
.dvt-panel a{color:var(--dsw-alias-state-business-primary,#4d8dff)}
.dvt-note{font-size:12px;color:var(--dsw-alias-label-tertiary,inherit);opacity:.9}
.dvt-ok{color:#30a46c}
`

export function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

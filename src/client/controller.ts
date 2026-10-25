/** 読み上げの状態遷移（単一の再生枠）。古い合成結果が後から再生されないよう世代で管理する。 */
import { markdownToSpeech } from '../text/markdown-to-speech.ts'
import { chunkText } from '../text/chunker.ts'
import type { Settings } from '../shared/settings.ts'
import { SynthesisJob, type Synthesizer } from './synthesis-queue.ts'

export type Status = 'idle' | 'synthesizing' | 'playing' | 'error'

export interface TtsState {
  status: Status
  messageId: string | null
  index: number
  total: number
  error: string | null
}

export interface PlayerLike {
  play(blob: Blob, volume: number): Promise<boolean>
  stop(): void
}

export interface ControllerDeps {
  getSettings: () => Settings
  /** 設定を引数に取り、1 文を WAV にする関数を返す。 */
  makeSynthesizer: (settings: Settings) => Synthesizer
  player: PlayerLike
  /** 先行合成の同時数（既定 2）。 */
  concurrency?: number
}

const IDLE: TtsState = { status: 'idle', messageId: null, index: 0, total: 0, error: null }

export class TtsController {
  private state: TtsState = IDLE
  private generation = 0
  private job: SynthesisJob | null = null
  private readonly listeners = new Set<() => void>()
  private readonly autoRead = new Set<string>()

  constructor(private readonly deps: ControllerDeps) {}

  getState = (): TtsState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: TtsState): void {
    this.state = next
    for (const l of this.listeners) l()
  }

  stop(): void {
    this.generation++
    this.job?.cancel()
    this.job = null
    this.deps.player.stop()
    this.set(IDLE)
  }

  /** 同じメッセージの再生中に押されたら停止、それ以外は読み直す（トグル）。 */
  toggle(messageId: string, markdown: string): void {
    const busy = this.state.status === 'synthesizing' || this.state.status === 'playing'
    if (this.state.messageId === messageId && busy) this.stop()
    else void this.speak(messageId, markdown)
  }

  /** 自動読み上げ。同じ messageId は一度だけ。設定 OFF のときは何もしない。 */
  maybeAutoRead(messageId: string, markdown: string): void {
    if (!this.deps.getSettings().autoRead || this.autoRead.has(messageId)) return
    this.autoRead.add(messageId)
    void this.speak(messageId, markdown)
  }

  async speak(messageId: string, markdown: string): Promise<void> {
    this.stop()
    const gen = this.generation
    const settings = this.deps.getSettings()
    const text = markdownToSpeech(markdown, { readCodeBlocks: settings.readCodeBlocks })
    const chunks = chunkText(text)
    if (chunks.length === 0) return
    const job = new SynthesisJob(chunks, this.deps.makeSynthesizer(settings), { concurrency: this.deps.concurrency ?? 2 })
    this.job = job
    this.set({ status: 'synthesizing', messageId, index: 0, total: chunks.length, error: null })
    try {
      for (;;) {
        const item = await job.next()
        if (gen !== this.generation || item === null) break
        this.set({ status: 'playing', messageId, index: item.index + 1, total: chunks.length, error: null })
        const finished = await this.deps.player.play(item.blob, settings.volumeScale)
        if (!finished || gen !== this.generation) return
        this.set({ status: 'synthesizing', messageId, index: item.index + 1, total: chunks.length, error: null })
      }
      if (gen === this.generation) this.set(IDLE)
    } catch (error) {
      if (gen !== this.generation) return
      job.cancel()
      this.job = null
      this.set({
        status: 'error',
        messageId,
        index: 0,
        total: chunks.length,
        error: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }
}

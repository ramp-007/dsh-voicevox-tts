/** 分割した文を順番どおりに先行合成して取り出すキュー。並列度を制限し、世代でキャンセルする。 */

export type Synthesizer = (text: string, signal: AbortSignal) => Promise<Blob>

export interface QueueOptions {
  /** 同時に合成する最大数。 */
  concurrency: number
}

/**
 * 1 回の読み上げ（job）ごとに作る。cancel() 後に完了した合成結果は破棄され、
 * 以降の next() は null を返すため、古い音声が後から再生されることはない。
 */
export class SynthesisJob {
  private readonly controller = new AbortController()
  private readonly results: Promise<Blob>[] = []
  private started = 0
  private inFlight = 0
  private cursor = 0

  constructor(
    private readonly chunks: readonly string[],
    private readonly synthesize: Synthesizer,
    private readonly options: QueueOptions,
  ) {
    this.pump()
  }

  get total(): number {
    return this.chunks.length
  }

  get cancelled(): boolean {
    return this.controller.signal.aborted
  }

  private pump(): void {
    while (!this.cancelled && this.inFlight < this.options.concurrency && this.started < this.chunks.length) {
      const index = this.started++
      this.inFlight++
      const p = this.synthesize(this.chunks[index] as string, this.controller.signal).finally(() => {
        this.inFlight--
        this.pump()
      })
      p.catch(() => {})
      this.results[index] = p
    }
  }

  /** 次の音声。終端・キャンセル時は null。合成失敗は reject する。 */
  async next(): Promise<{ index: number; blob: Blob } | null> {
    if (this.cancelled || this.cursor >= this.chunks.length) return null
    const index = this.cursor++
    let pending = this.results[index]
    // concurrency 上限で未着手の場合は pump が起動するまで待つ
    while (pending === undefined && !this.cancelled) {
      await new Promise((r) => setTimeout(r, 5))
      pending = this.results[index]
    }
    if (pending === undefined) return null
    const blob = await pending
    if (this.cancelled) return null
    return { index, blob }
  }

  cancel(): void {
    this.controller.abort()
  }
}

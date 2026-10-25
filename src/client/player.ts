/** WAV Blob を 1 つずつ再生する薄いラッパー。 */

export interface AudioLike {
  volume: number
  src: string
  onended: (() => void) | null
  onerror: (() => void) | null
  play(): Promise<void>
  pause(): void
}

export class Player {
  private audio: AudioLike | null = null
  private url: string | null = null
  private settle: ((ok: boolean) => void) | null = null

  constructor(
    private readonly create: () => AudioLike = () => new Audio() as unknown as AudioLike,
    private readonly urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
  ) {}

  /** 再生が最後まで終われば true、stop() で中断されれば false。再生エラーは reject。 */
  play(blob: Blob, volume: number): Promise<boolean> {
    this.stop()
    return new Promise<boolean>((resolve, reject) => {
      const audio = this.create()
      const url = this.urls.createObjectURL(blob)
      this.audio = audio
      this.url = url
      this.settle = resolve
      audio.volume = Math.min(1, Math.max(0, volume))
      audio.src = url
      audio.onended = () => {
        this.release()
        resolve(true)
      }
      audio.onerror = () => {
        this.release()
        reject(new Error('audio playback failed'))
      }
      audio.play().catch((error: unknown) => {
        this.release()
        reject(error instanceof Error ? error : new Error('audio playback failed'))
      })
    })
  }

  stop(): void {
    const settle = this.settle
    this.audio?.pause()
    this.release()
    settle?.(false)
  }

  private release(): void {
    if (this.audio) {
      this.audio.onended = null
      this.audio.onerror = null
    }
    if (this.url) this.urls.revokeObjectURL(this.url)
    this.audio = null
    this.url = null
    this.settle = null
  }
}

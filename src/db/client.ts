// Talks to Postgres in a background worker. If a query runs too long, the worker is
// replaced with a fresh one, so a runaway query can never freeze the page.

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }

export class DbClient {
  private worker!: Worker
  private seq = 0
  private pending = new Map<number, Pending>()
  ready!: Promise<void>
  private markReady = () => {}
  onRestart: (reason: string) => void = () => {}

  constructor() {
    this.spawn()
  }

  private spawn() {
    this.ready = new Promise(r => { this.markReady = r })
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; body?: unknown; error?: string; ready?: boolean }>) => {
      if (e.data.ready) return this.markReady()
      const p = this.pending.get(e.data.id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.body)
      else p.reject(new Error(e.data.error))
    }
    this.worker.onerror = e => this.restart(`Postgres crashed (${e.message || 'unknown error'}) and was restarted.`)
  }

  async call<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
    await this.ready
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => this.restart(`Stopped after ${timeoutMs / 1000} seconds, so Postgres was restarted with fresh data.`), timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.worker.postMessage({ id, type, ...payload })
    })
  }

  private restart(reason: string) {
    this.worker.terminate()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
    this.spawn()
    this.onRestart(reason)
  }
}

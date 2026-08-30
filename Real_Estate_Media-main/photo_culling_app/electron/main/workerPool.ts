import { Worker } from 'node:worker_threads'
import os from 'node:os'
import type { WorkerTask, WorkerResult } from './workerContract'

type PendingResolve = (result: WorkerResult) => void

interface QueueEntry {
  task: WorkerTask
  resolve: PendingResolve
}

export class ImageWorkerPool {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private busy = new Map<Worker, PendingResolve>()
  private queue: QueueEntry[] = []
  private nextId = 1

  constructor(workerScriptPath: string, size = Math.max(2, Math.min(4, os.cpus().length - 1))) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerScriptPath)
      worker.on('message', (result: WorkerResult) => this.handleMessage(worker, result))
      worker.on('error', (err) => this.handleError(worker, err))
      this.workers.push(worker)
      this.idleWorkers.push(worker)
    }
  }

  get size(): number {
    return this.workers.length
  }

  run(task: Omit<WorkerTask, 'id'>): Promise<WorkerResult> {
    const id = this.nextId++
    const fullTask: WorkerTask = { ...task, id }
    return new Promise((resolve) => {
      this.queue.push({ task: fullTask, resolve })
      this.pump()
    })
  }

  private pump(): void {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop()!
      const entry = this.queue.shift()!
      this.busy.set(worker, entry.resolve)
      worker.postMessage(entry.task)
    }
  }

  private handleMessage(worker: Worker, result: WorkerResult): void {
    const resolve = this.busy.get(worker)
    this.busy.delete(worker)
    this.idleWorkers.push(worker)
    resolve?.(result)
    this.pump()
  }

  private handleError(worker: Worker, err: Error): void {
    const resolve = this.busy.get(worker)
    this.busy.delete(worker)
    resolve?.({ id: -1, ok: false, error: err.message })
    // Worker thread crashed; drop it from rotation rather than risk a
    // half-dead pool silently losing tasks.
    this.workers = this.workers.filter((w) => w !== worker)
    this.pump()
  }

  destroy(): void {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.workers = []
    this.idleWorkers = []
    this.busy.clear()
  }
}

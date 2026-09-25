import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultDeckSettings } from '$lib/domain/defaults'
import type { OptimizationReport } from '$lib/scheduler/optimizer'
import type { OptimizerRequest, OptimizerResponse } from '$lib/scheduler/optimizer.worker'
import { OptimizerError, runOptimizer } from '$lib/ui/deck/optimizer-client'

class FakeWorker {
  static last: FakeWorker | null = null
  onmessage: ((event: MessageEvent<OptimizerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: unknown[] = []
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(data: unknown) {
    this.posted.push(data)
  }
  terminate() {
    this.terminated = true
  }
  answer(data: OptimizerResponse) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

const request: OptimizerRequest = {
  reviews: [],
  dayStartHour: 4,
  settings: defaultDeckSettings().fsrs,
  now: 0,
}

function worker(): FakeWorker {
  if (!FakeWorker.last) throw new Error('no worker')
  return FakeWorker.last
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWorker.last = null
})

describe('runOptimizer (one-shot worker)', () => {
  it('resolves with the report and terminates the worker', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pending = runOptimizer(request)
    expect(worker().posted).toEqual([request])
    const summary = {
      logLoss: 0,
      rmse: 0,
      predicted: 0,
      observed: 0,
      n: 0,
      params: [],
      intervals: [],
    }
    const report: OptimizationReport = { params: [], old: summary, next: summary, better: false }
    worker().answer({ type: 'done', report })
    await expect(pending).resolves.toBe(report)
    expect(worker().terminated).toBe(true)
  })

  it('rejects with the worker’s error code', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pending = runOptimizer(request)
    worker().answer({ type: 'error', code: 'unsupported' })
    await expect(pending).rejects.toEqual(new OptimizerError('unsupported'))
    expect(worker().terminated).toBe(true)
  })

  it('reports a crash of the worker as a failure', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pending = runOptimizer(request)
    worker().onerror?.()
    await expect(pending).rejects.toMatchObject({ code: 'failed' })
    expect(worker().terminated).toBe(true)
  })

  it('reports an answer that cannot be received as a failure', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pending = runOptimizer(request)
    worker().onmessageerror?.()
    await expect(pending).rejects.toMatchObject({ code: 'failed' })
    expect(worker().terminated).toBe(true)
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
    const pending = runOptimizer(request, { timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toMatchObject({ code: 'timeout' })
    expect(worker().terminated).toBe(true)
  })

  it('terminates the worker at once when the caller aborts', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const controller = new AbortController()
    const pending = runOptimizer(request, { signal: controller.signal })
    expect(worker().terminated).toBe(false)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
    expect(worker().terminated).toBe(true)
  })

  it('does not start a worker for an aborted run', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const controller = new AbortController()
    controller.abort()
    await expect(runOptimizer(request, { signal: controller.signal })).rejects.toMatchObject({
      code: 'aborted',
    })
    expect(FakeWorker.last).toBeNull()
  })

  it('is unsupported without Web Workers', async () => {
    vi.stubGlobal('Worker', undefined)
    await expect(runOptimizer(request)).rejects.toMatchObject({ code: 'unsupported' })
  })
})

import type { OptimizationReport } from '$lib/scheduler/optimizer'
import type {
  OptimizerErrorCode,
  OptimizerRequest,
  OptimizerResponse,
} from '$lib/scheduler/optimizer.worker'

/** `aborted`: the caller gave up (the settings were closed); nothing to show. */
export type OptimizerFailure = OptimizerErrorCode | 'timeout' | 'aborted'

export class OptimizerError extends Error {
  constructor(readonly code: OptimizerFailure) {
    super(code)
    this.name = 'OptimizerError'
  }
}

/** Far above the expected duration (under a second on desktop, a few seconds on a phone). */
export const OPTIMIZER_TIMEOUT_MS = 120_000

export interface RunOptions {
  /** Aborting terminates the worker at once (e.g. when the settings are closed mid-run). */
  signal?: AbortSignal
  timeoutMs?: number
}

/** Runs the optimizer in a one-shot Web Worker, terminated on answer, error, timeout or abort. */
export function runOptimizer(
  request: OptimizerRequest,
  { signal, timeoutMs = OPTIMIZER_TIMEOUT_MS }: RunOptions = {},
): Promise<OptimizationReport> {
  if (signal?.aborted) return Promise.reject(new OptimizerError('aborted'))
  if (typeof Worker === 'undefined') return Promise.reject(new OptimizerError('unsupported'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../scheduler/optimizer.worker.ts', import.meta.url), {
      type: 'module',
    })
    const fail = (code: OptimizerFailure) => {
      finish()
      reject(new OptimizerError(code))
    }
    const abort = () => fail('aborted')
    const timer = setTimeout(() => fail('timeout'), timeoutMs)
    function finish() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    signal?.addEventListener('abort', abort)
    worker.onmessage = (event: MessageEvent<OptimizerResponse>) => {
      const msg = event.data
      if (msg.type === 'error') return fail(msg.code)
      finish()
      resolve(msg.report)
    }
    worker.onerror = () => fail('failed')
    worker.onmessageerror = () => fail('failed')
    worker.postMessage(request)
  })
}

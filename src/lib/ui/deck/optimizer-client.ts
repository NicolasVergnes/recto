import type { OptimizationReport } from '$lib/scheduler/optimizer'
import type {
  OptimizerErrorCode,
  OptimizerRequest,
  OptimizerResponse,
} from '$lib/scheduler/optimizer.worker'

export type OptimizerFailure = OptimizerErrorCode | 'timeout'

export class OptimizerError extends Error {
  constructor(readonly code: OptimizerFailure) {
    super(code)
    this.name = 'OptimizerError'
  }
}

/** Far above the expected duration (under a second on desktop, a few seconds on a phone). */
export const OPTIMIZER_TIMEOUT_MS = 120_000

/** Runs the optimizer in a one-shot Web Worker, terminated on answer, error or timeout. */
export function runOptimizer(
  request: OptimizerRequest,
  timeoutMs = OPTIMIZER_TIMEOUT_MS,
): Promise<OptimizationReport> {
  if (typeof Worker === 'undefined') return Promise.reject(new OptimizerError('unsupported'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../scheduler/optimizer.worker.ts', import.meta.url), {
      type: 'module',
    })
    const fail = (code: OptimizerFailure) => {
      finish()
      reject(new OptimizerError(code))
    }
    const timer = setTimeout(() => fail('timeout'), timeoutMs)
    function finish() {
      clearTimeout(timer)
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<OptimizerResponse>) => {
      const msg = event.data
      if (msg.type === 'error') return fail(msg.code)
      finish()
      resolve(msg.report)
    }
    worker.onerror = () => fail('failed')
    worker.postMessage(request)
  })
}

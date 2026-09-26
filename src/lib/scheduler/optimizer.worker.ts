/**
 * FSRS parameter optimisation off the main thread (03 §2.4). fsrs-browser (WASM) is loaded here,
 * on demand; its .wasm file is precached by the service worker. Single-threaded: initThreadPool
 * is never called, so no cross-origin isolation is needed. One-shot: the client terminates the
 * worker after the answer, since a Rust panic leaves the WASM instance unusable.
 */
import init, { Fsrs } from 'fsrs-browser'
import wasmUrl from 'fsrs-browser/fsrs_browser_bg.wasm?url'
import type { FsrsSettings } from '../domain/types'
import {
  buildTrainingSet,
  compareParams,
  type OptimizationReport,
  type TrainingReview,
} from './optimizer'

export interface OptimizerRequest {
  reviews: TrainingReview[]
  dayStartHour: number
  /** The deck's saved FSRS settings (current parameters, steps and limits for the intervals). */
  settings: FsrsSettings
  now: number
}

export type OptimizerErrorCode = 'unsupported' | 'notEnoughData' | 'failed'

export type OptimizerResponse =
  { type: 'done'; report: OptimizationReport } | { type: 'error'; code: OptimizerErrorCode }

/** The glue always allocates shared WebAssembly memory (wasm-bindgen-rayon). */
function sharedMemorySupported(): boolean {
  try {
    new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true })
    return true
  } catch {
    return false
  }
}

function reply(message: OptimizerResponse) {
  self.postMessage(message)
}

self.onmessage = async (event: MessageEvent<OptimizerRequest>) => {
  const { reviews, dayStartHour, settings, now } = event.data
  if (!sharedMemorySupported()) return reply({ type: 'error', code: 'unsupported' })
  try {
    // A failed fetch of the .wasm or a memory allocation error: worth another try later.
    await init({ module_or_path: wasmUrl })
    const set = buildTrainingSet(reviews, dayStartHour)
    if (set.items === 0) return reply({ type: 'error', code: 'notEnoughData' })
    // Same cap on w17/w18 as ts-fsrs applies when scheduling with these relearning steps.
    const relearningSteps = settings.relearningSteps.length
    // A Rust panic surfaces here as `RuntimeError: unreachable`.
    const computed = new Fsrs().computeParameters(
      set.ratings,
      set.deltaTs,
      set.lengths,
      null,
      true,
      null,
      relearningSteps,
    )
    const result = compareParams(set.histories, settings, computed, now)
    reply(
      typeof result === 'string'
        ? { type: 'error', code: result }
        : { type: 'done', report: result },
    )
  } catch {
    reply({ type: 'error', code: 'failed' })
  }
}

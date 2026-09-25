// @vitest-environment node
/**
 * Locks the input format of fsrs-browser's optimizer (03 §2.4) by running the real WASM module in
 * Node, single-threaded like the worker (initThreadPool is never called).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultDeckSettings } from '$lib/domain/defaults'
import type { FsrsSettings } from '$lib/domain/types'
import { buildFsrs, DEFAULT_PARAMS } from '$lib/scheduler/fsrs'
import {
  buildTrainingSet,
  compareParams,
  roundParams,
  type OptimizationReport,
  type TrainingSet,
} from '$lib/scheduler/optimizer'
import { FORGETFUL_W, simulateReviews } from '../../helpers/fsrs-sim'

type FsrsBrowser = typeof import('fsrs-browser/fsrs_browser.js')
let wasm: FsrsBrowser

/** The worker's call. */
const compute = (set: TrainingSet, settings: FsrsSettings) =>
  new wasm.Fsrs().computeParameters(
    set.ratings,
    set.deltaTs,
    set.lengths,
    null,
    true,
    null,
    settings.relearningSteps.length,
  )

const now = Date.UTC(2026, 8, 25, 10)

function report(set: TrainingSet, settings: FsrsSettings): OptimizationReport {
  const result = compareParams(set.histories, settings, compute(set, settings), now)
  if (typeof result === 'string') throw new Error(result)
  return result
}

beforeAll(async () => {
  // The rayon helper bundled with the glue listens on `self` at load time (a worker global).
  vi.stubGlobal('self', { addEventListener() {}, removeEventListener() {} })
  // No `main` field (browser-only package): import the glue file itself.
  wasm = await import('fsrs-browser/fsrs_browser.js')
  const path = createRequire(import.meta.url).resolve('fsrs-browser/fsrs_browser_bg.wasm')
  wasm.initSync({ module: readFileSync(path) })
})

describe('fsrs-browser computeParameters', () => {
  it('has the same defaults as ts-fsrs', () => {
    expect(Array.from(wasm.DEFAULT_PARAMETERS(), (x) => Math.round(x * 1e4) / 1e4)).toEqual([
      ...DEFAULT_PARAMS,
    ])
  })

  it('learns better parameters from our training set, deterministically', () => {
    const set = buildTrainingSet(simulateReviews(250, FORGETFUL_W, 5), 4)
    expect(set.reviews).toBeGreaterThan(1000)
    const settings = defaultDeckSettings().fsrs
    const w = compute(set, settings)
    expect(w).toHaveLength(21)
    expect(Array.from(w).every(Number.isFinite)).toBe(true)
    expect(Array.from(compute(set, settings))).toEqual(Array.from(w))
    const result = report(set, settings)
    expect(result.better).toBe(true)
    expect(result.params).not.toEqual([...DEFAULT_PARAMS])
    // Faster forgetting than the defaults is found: lower initial stability after Good.
    expect(result.params[2]).toBeLessThan(DEFAULT_PARAMS[2] ?? 0)
  })

  it('respects the cap on w17/w18 that the deck’s relearning steps set in ts-fsrs', () => {
    const set = buildTrainingSet(simulateReviews(250, FORGETFUL_W, 5), 4)
    const settings = {
      ...defaultDeckSettings().fsrs,
      relearningSteps: ['10m', '20m', '30m', '1h'],
    }
    const scheduled = (params: number[]) =>
      buildFsrs({ ...settings, params }, false).parameters.w[17] ?? -1
    // Trained as if the deck had a single relearning step, w17 would be lowered when scheduling.
    const unaware = roundParams(compute(set, defaultDeckSettings().fsrs)) ?? []
    expect(scheduled(unaware)).toBeLessThan((unaware[17] ?? 0) - 0.01)
    // Trained with the deck's steps: the scheduler uses what was trained and evaluated.
    const { params } = report(set, settings)
    expect(scheduled(params)).toBeCloseTo(params[17] ?? -1, 3)
  })

  it('returns the defaults unchanged when data is scarce: nothing to offer', () => {
    // A few usable histories (e.g. most cards imported without their history).
    const set = buildTrainingSet(simulateReviews(4, FORGETFUL_W, 9), 4)
    expect(set.items).toBeGreaterThan(0)
    const custom = { ...defaultDeckSettings().fsrs, params: FORGETFUL_W }
    const w = compute(set, custom)
    expect(Array.from(w, (x) => Math.round(x * 1e4) / 1e4)).toEqual([...DEFAULT_PARAMS])
    expect(compareParams(set.histories, custom, w, now)).toBe('notEnoughData')
  })
})

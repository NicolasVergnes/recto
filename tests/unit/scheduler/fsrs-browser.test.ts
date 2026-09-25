// @vitest-environment node
/**
 * Locks the input format of fsrs-browser's optimizer (03 §2.4) by running the real WASM module in
 * Node, single-threaded like the worker (initThreadPool is never called).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultDeckSettings } from '$lib/domain/defaults'
import { DEFAULT_PARAMS } from '$lib/scheduler/fsrs'
import { buildTrainingSet, compareParams, type TrainingSet } from '$lib/scheduler/optimizer'
import { FORGETFUL_W, simulateReviews } from '../../helpers/fsrs-sim'

type FsrsBrowser = typeof import('fsrs-browser/fsrs_browser.js')
let wasm: FsrsBrowser

const compute = (set: TrainingSet) =>
  new wasm.Fsrs().computeParameters(set.ratings, set.deltaTs, set.lengths, null, true)

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
    const w = compute(set)
    expect(w).toHaveLength(21)
    expect(Array.from(w).every(Number.isFinite)).toBe(true)
    expect(Array.from(compute(set))).toEqual(Array.from(w))
    const settings = defaultDeckSettings().fsrs
    const report = compareParams(set.histories, settings, w, Date.UTC(2026, 8, 25, 10))
    expect(report?.better).toBe(true)
    expect(report?.params).not.toEqual([...DEFAULT_PARAMS])
    // Faster forgetting than the defaults is found: lower initial stability after Good.
    expect(report?.params[2]).toBeLessThan(DEFAULT_PARAMS[2] ?? 0)
  })

  it('returns the defaults unchanged when data is scarce', () => {
    const set = buildTrainingSet(simulateReviews(5, FORGETFUL_W, 9), 4)
    expect(set.items).toBeGreaterThan(0)
    const report = compareParams(
      set.histories,
      defaultDeckSettings().fsrs,
      compute(set),
      Date.UTC(2026, 8, 25, 10),
    )
    expect(report?.params).toEqual([...DEFAULT_PARAMS])
    expect(report?.better).toBe(false)
  })
})

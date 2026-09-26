import { defaultDeckSettings } from '$lib/domain/defaults'
import type { Rating } from '$lib/domain/types'
import { buildFsrs } from '$lib/scheduler/fsrs'
import type { TrainingReview } from '$lib/scheduler/optimizer'

const DAY = 86_400_000

/** A learner who forgets faster than the FSRS-6 defaults assume (decay 0.3). */
export const FORGETFUL_W = [
  0.1, 0.5, 1, 4, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.3,
]

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Review log of `cards` cards answered by a learner whose memory follows FSRS with parameters
 * `w`: each answer succeeds with the probability the model predicts. Reviews happen at noon
 * (Paris), failures are relearnt the same day.
 */
export function simulateReviews(
  cards: number,
  w: readonly number[],
  seed = 1,
  start = new Date('2026-01-05T11:00:00Z').getTime(),
): TrainingReview[] {
  const f = buildFsrs({ ...defaultDeckSettings().fsrs, params: [...w] }, false)
  const random = rng(seed)
  const out: TrainingReview[] = []
  for (let c = 0; c < cards; c++) {
    const cardId = `c${String(c).padStart(4, '0')}`
    let day = c % 40
    let at = start + day * DAY
    const log = (rating: Rating, stateBefore: TrainingReview['stateBefore']) => {
      out.push({ id: `${cardId}-${out.length}`, cardId, reviewedAt: at, rating, stateBefore })
      at += 10 * 60_000
    }
    const u = random()
    const first: Rating = u < 0.2 ? 1 : u < 0.25 ? 2 : u < 0.9 ? 3 : 4
    log(first, 0)
    let state = f.next_state(null, 0, first)
    if (first < 3) {
      log(3, 1)
      state = f.next_state(state, 0, 3)
    }
    const reviews = 4 + Math.floor(random() * 6)
    for (let k = 0; k < reviews; k++) {
      // Delays double independently of the answers: they probe the whole forgetting curve.
      const delta = Math.max(1, Math.round(2 ** k * (0.5 + random())))
      day += delta
      at = start + day * DAY
      const success = random() < f.forgetting_curve(delta, state.stability)
      const v = random()
      const rating: Rating = !success ? 1 : v < 0.1 ? 2 : v < 0.9 ? 3 : 4
      log(rating, 2)
      state = f.next_state(state, delta, rating)
      if (rating === 1) {
        log(3, 3)
        state = f.next_state(state, 0, 3)
      }
    }
  }
  return out
}

/**
 * Schedulers (03-SCHEDULING): common interface, FSRS-6 adapter over ts-fsrs (`fsrs.ts`) and the
 * seven-box Leitner "Memory Box" (`leitner.ts`). Pure: `now` is always a parameter.
 */
import type { SchedulerKind } from '../domain/types'
import { createFsrsScheduler } from './fsrs'
import { createLeitnerScheduler } from './leitner'
import type { Scheduler, SchedulerOptions } from './types'

export type { PreviewItem, Scheduler, SchedulerOptions, SchedulerOutcome } from './types'
export { canRetire } from './retire'

export function getScheduler(
  kind: SchedulerKind,
  options: Partial<SchedulerOptions> = {},
): Scheduler {
  const opts: SchedulerOptions = { dayStartHour: 4, fuzz: true, ...options }
  return kind === 'fsrs' ? createFsrsScheduler(opts) : createLeitnerScheduler(opts)
}

/**
 * Validation of data coming from outside (backup files): `unknown` in, typed values or null out
 * (06 §5: no `any`, manual validators).
 */
import { defaultDeckSettings } from '../domain/defaults'
import {
  MODEL_TYPES,
  type Card,
  type Deck,
  type DeckSettings,
  type Note,
  type Review,
  type Setting,
} from '../domain/types'
import { validateFsrsSettings } from '../scheduler/fsrs'

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isBool = (x: unknown): x is boolean => typeof x === 'boolean'
const isStrArray = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)
const isNumArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNum)
const oneOf = <T extends string | number>(values: readonly T[], x: unknown): x is T =>
  values.some((v) => v === x)
const optStr = (x: unknown) => x === undefined || isStr(x)
const nullableNum = (x: unknown): x is number | null => x === null || isNum(x)

function readSettings(x: unknown): DeckSettings | null {
  const d = defaultDeckSettings()
  if (!isObj(x) || !isObj(x.fsrs) || !isObj(x.leitner)) return null
  const f = x.fsrs
  const l = x.leitner
  const settings: DeckSettings = {
    newPerDay: isNum(x.newPerDay) ? x.newPerDay : d.newPerDay,
    reviewsPerDay: isNum(x.reviewsPerDay) ? x.reviewsPerDay : d.reviewsPerDay,
    newOrder: oneOf(['added', 'random'] as const, x.newOrder) ? x.newOrder : d.newOrder,
    typedAnswer: isBool(x.typedAnswer) ? x.typedAnswer : d.typedAnswer,
    autoplayAudio: isBool(x.autoplayAudio) ? x.autoplayAudio : d.autoplayAudio,
    burySiblings: isBool(x.burySiblings) ? x.burySiblings : d.burySiblings,
    fsrs: {
      requestRetention: isNum(f.requestRetention) ? f.requestRetention : d.fsrs.requestRetention,
      maximumInterval: isNum(f.maximumInterval) ? f.maximumInterval : d.fsrs.maximumInterval,
      learningSteps: isStrArray(f.learningSteps) ? f.learningSteps : d.fsrs.learningSteps,
      relearningSteps: isStrArray(f.relearningSteps) ? f.relearningSteps : d.fsrs.relearningSteps,
      params: isNumArray(f.params) ? f.params : null,
      ratingMode: f.ratingMode === 2 ? 2 : 4,
    },
    leitner: {
      mode: l.mode === 'calendar' ? 'calendar' : 'interval',
      intervals:
        isNumArray(l.intervals) && l.intervals.length === 7 ? l.intervals : d.leitner.intervals,
      alternateSides: isBool(l.alternateSides) ? l.alternateSides : d.leitner.alternateSides,
      allowSure: isBool(l.allowSure) ? l.allowSure : d.leitner.allowSure,
      failToBox: 1,
    },
  }
  // Scheduler parameters are validated before they ever reach fsrs() (03 §2.1).
  return validateFsrsSettings(settings.fsrs).length === 0 ? settings : null
}

export function readDeck(x: unknown): Deck | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.name) || !isNum(x.createdAt) || !isNum(x.updatedAt)) {
    return null
  }
  if (!oneOf(['fsrs', 'leitner'] as const, x.scheduler)) return null
  if (!(x.parentId === undefined || x.parentId === null || isStr(x.parentId))) return null
  if (!optStr(x.description) || !optStr(x.emoji)) return null
  const settings = readSettings(x.settings)
  if (!settings) return null
  const deck: Deck = {
    id: x.id,
    name: x.name,
    parentId: isStr(x.parentId) ? x.parentId : null,
    scheduler: x.scheduler,
    settings,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
  if (isStr(x.description)) deck.description = x.description
  if (isStr(x.emoji)) deck.emoji = x.emoji
  return deck
}

export function readNote(x: unknown): Note | null {
  if (
    !isObj(x) ||
    !isStr(x.id) ||
    !isStr(x.deckId) ||
    !isStrArray(x.fields) ||
    !isStrArray(x.tags)
  ) {
    return null
  }
  if (!oneOf(MODEL_TYPES, x.modelType)) return null
  if (!isNum(x.createdAt) || !isNum(x.updatedAt) || !optStr(x.source) || !optStr(x.sourceGuid)) {
    return null
  }
  const note: Note = {
    id: x.id,
    deckId: x.deckId,
    modelType: x.modelType,
    fields: x.fields,
    tags: x.tags,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  }
  if (isStr(x.source)) note.source = x.source
  if (isStr(x.sourceGuid)) note.sourceGuid = x.sourceGuid
  return note
}

const STATES = [0, 1, 2, 3] as const
const RATINGS = [1, 2, 3, 4] as const
const FLAGS = [0, 1, 2, 3, 4] as const

export function readCard(x: unknown): Card | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.noteId) || !isStr(x.deckId)) return null
  const nums = [
    'ord',
    'due',
    'reps',
    'lapses',
    'stability',
    'difficulty',
    'scheduledDays',
    'learningSteps',
    'box',
    'createdAt',
  ]
  if (!nums.every((k) => isNum(x[k]))) return null
  if (!oneOf(STATES, x.state) || !oneOf(FLAGS, x.flag ?? 0) || !nullableNum(x.lastReview))
    return null
  if (!isBool(x.suspended) || !isBool(x.retired) || !isBool(x.sideFlipped)) return null
  const n = (k: string) => Number(x[k])
  return {
    id: x.id,
    noteId: x.noteId,
    deckId: x.deckId,
    ord: n('ord'),
    due: n('due'),
    state: x.state,
    reps: n('reps'),
    lapses: n('lapses'),
    lastReview: x.lastReview,
    suspended: x.suspended,
    retired: x.retired,
    flag: oneOf(FLAGS, x.flag) ? x.flag : 0,
    stability: n('stability'),
    difficulty: n('difficulty'),
    scheduledDays: n('scheduledDays'),
    learningSteps: n('learningSteps'),
    box: n('box'),
    sideFlipped: x.sideFlipped,
    createdAt: n('createdAt'),
  }
}

export function readReview(x: unknown): Review | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.cardId) || !isStr(x.deckId)) return null
  if (!oneOf(RATINGS, x.rating) || !oneOf(['fsrs', 'leitner'] as const, x.scheduler)) return null
  if (
    !oneOf(STATES, x.stateBefore) ||
    !oneOf(STATES, x.stateAfter) ||
    !nullableNum(x.lastReviewBefore)
  ) {
    return null
  }
  const nums = [
    'reviewedAt',
    'durationMs',
    'dueBefore',
    'stabilityBefore',
    'difficultyBefore',
    'boxBefore',
    'learningStepsBefore',
    'dueAfter',
    'scheduledDays',
    'elapsedDays',
    'boxAfter',
  ]
  if (!nums.every((k) => isNum(x[k]))) return null
  const n = (k: string) => Number(x[k])
  return {
    id: x.id,
    cardId: x.cardId,
    deckId: x.deckId,
    reviewedAt: n('reviewedAt'),
    rating: x.rating,
    scheduler: x.scheduler,
    durationMs: n('durationMs'),
    stateBefore: x.stateBefore,
    dueBefore: n('dueBefore'),
    stabilityBefore: n('stabilityBefore'),
    difficultyBefore: n('difficultyBefore'),
    boxBefore: n('boxBefore'),
    learningStepsBefore: n('learningStepsBefore'),
    lastReviewBefore: x.lastReviewBefore,
    stateAfter: x.stateAfter,
    dueAfter: n('dueAfter'),
    scheduledDays: n('scheduledDays'),
    elapsedDays: n('elapsedDays'),
    boxAfter: n('boxAfter'),
  }
}

export function readSetting(x: unknown): Setting | null {
  return isObj(x) && isStr(x.key) && 'value' in x ? { key: x.key, value: x.value } : null
}

export interface MediaMeta {
  name: string
  mime: string
  size: number
  sha256: string
  createdAt: number
}

export function readMediaMeta(x: unknown): MediaMeta | null {
  if (!isObj(x) || !isStr(x.name) || !isStr(x.mime) || !isStr(x.sha256)) return null
  if (!isNum(x.size) || !isNum(x.createdAt)) return null
  return { name: x.name, mime: x.mime, size: x.size, sha256: x.sha256, createdAt: x.createdAt }
}

/** Reads an array of rows, keeping the valid ones and counting the others. */
export function readAll<T>(
  x: unknown,
  read: (row: unknown) => T | null,
): { rows: T[]; invalid: number } {
  if (!Array.isArray(x)) return { rows: [], invalid: 0 }
  const rows: T[] = []
  let invalid = 0
  for (const row of x) {
    const value = read(row)
    if (value) rows.push(value)
    else invalid++
  }
  return { rows, invalid }
}

export interface ManifestFields {
  schemaVersion: number
  appVersion: string
  exportedAt: number
  device: string
}

export function readManifest(x: unknown): ManifestFields | null {
  if (!isObj(x) || x.format !== 'recto-backup' || !isNum(x.schemaVersion)) return null
  return {
    schemaVersion: x.schemaVersion,
    appVersion: isStr(x.appVersion) ? x.appVersion : '',
    exportedAt: isNum(x.exportedAt) ? x.exportedAt : 0,
    device: isStr(x.device) ? x.device : '',
  }
}

export function readObject(x: unknown): Record<string, unknown> | null {
  return isObj(x) ? x : null
}

import type { Deck, Rating } from '$lib/domain/types'

/** What a key press asks the review screen to do (04-UI §2.2). */
export type ReviewKeyAction =
  { kind: 'undo' | 'reveal' | 'edit' | 'replay' } | { kind: 'rate'; rating: Rating }

export interface ReviewKeyContext {
  revealed: boolean
  /** The card information dialog is open: its own keys win. */
  infoOpen: boolean
  /** "Show answer": Enter and Space on any other button keep their native meaning. */
  showButton: EventTarget | undefined
  ratings: readonly Rating[]
  deck: Pick<Deck, 'scheduler' | 'settings'> | undefined
}

type KeyInput = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>

/**
 * Review shortcuts: Space/Enter reveal, 1–4 rate, Space = Good in two-button FSRS mode (not in
 * four-button mode, to avoid accidental ratings), Ctrl+Z undo (even in a field), E edit,
 * R replay. Other keys, and keys typed in a field, return null.
 */
export function reviewKeyAction(e: KeyInput, ctx: ReviewKeyContext): ReviewKeyAction | null {
  const key = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && key === 'z') return { kind: 'undo' }
  const target = e.target
  const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  if (inField || e.ctrlKey || e.metaKey || e.altKey || ctx.infoOpen) return null
  if (!ctx.revealed && (e.key === ' ' || e.key === 'Enter')) {
    // Buttons handle their own Enter/Space activation.
    if (target instanceof HTMLButtonElement && target !== ctx.showButton) return null
    return { kind: 'reveal' }
  }
  if (ctx.revealed && /^[1-4]$/.test(e.key)) {
    const rating = ctx.ratings[Number(e.key) - 1]
    return rating ? { kind: 'rate', rating } : null
  }
  const twoButtons = ctx.deck?.scheduler === 'fsrs' && ctx.deck.settings.fsrs.ratingMode === 2
  if (ctx.revealed && e.key === ' ' && twoButtons) return { kind: 'rate', rating: 3 }
  if (key === 'e') return { kind: 'edit' }
  if (key === 'r') return { kind: 'replay' }
  return null
}

/** Undo, reveal and rate replace the browser default (Space scrolls, Ctrl+Z edits a field). */
export function preventsDefault(action: ReviewKeyAction): boolean {
  return action.kind !== 'edit' && action.kind !== 'replay'
}

import { describe, expect, it } from 'vitest'
import type { Rating } from '$lib/domain/types'
import { preventsDefault, reviewKeyAction, type ReviewKeyContext } from '$lib/ui/review/keys'
import { deck } from '../helpers/fixtures'

const showButton = document.createElement('button')

function ctx(patch: Partial<ReviewKeyContext> = {}): ReviewKeyContext {
  return {
    revealed: false,
    infoOpen: false,
    showButton,
    ratings: [1, 2, 3, 4],
    deck: deck('d1'),
    ...patch,
  }
}

function press(
  key: string,
  mods: {
    ctrlKey?: boolean
    metaKey?: boolean
    altKey?: boolean
    target?: EventTarget | null
  } = {},
) {
  return { key, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...mods }
}

describe('review keyboard shortcuts (04-UI §2.2)', () => {
  it('reveals with Space or Enter, unless another button has the focus', () => {
    expect(reviewKeyAction(press(' '), ctx())).toEqual({ kind: 'reveal' })
    expect(reviewKeyAction(press('Enter'), ctx())).toEqual({ kind: 'reveal' })
    expect(reviewKeyAction(press('Enter', { target: showButton }), ctx())).toEqual({
      kind: 'reveal',
    })
    const other = document.createElement('button')
    expect(reviewKeyAction(press(' ', { target: other }), ctx())).toBeNull()
    expect(reviewKeyAction(press('Enter', { target: other }), ctx())).toBeNull()
  })

  it('rates with 1–4 after the reveal only, following the visible buttons', () => {
    expect(reviewKeyAction(press('3'), ctx())).toBeNull()
    expect(reviewKeyAction(press('1'), ctx({ revealed: true }))).toEqual({
      kind: 'rate',
      rating: 1,
    })
    expect(reviewKeyAction(press('4'), ctx({ revealed: true }))).toEqual({
      kind: 'rate',
      rating: 4,
    })
    const two: Rating[] = [1, 3]
    expect(reviewKeyAction(press('2'), ctx({ revealed: true, ratings: two }))).toEqual({
      kind: 'rate',
      rating: 3,
    })
    expect(reviewKeyAction(press('3'), ctx({ revealed: true, ratings: two }))).toBeNull()
    expect(reviewKeyAction(press('5'), ctx({ revealed: true }))).toBeNull()
  })

  it('Space means Good only in two-button FSRS mode', () => {
    const twoButtons = deck('d2', 'fsrs', { fsrs: { ratingMode: 2 } })
    expect(reviewKeyAction(press(' '), ctx({ revealed: true, deck: twoButtons }))).toEqual({
      kind: 'rate',
      rating: 3,
    })
    expect(reviewKeyAction(press(' '), ctx({ revealed: true }))).toBeNull()
    const leitner = deck('d3', 'leitner', { fsrs: { ratingMode: 2 } })
    expect(reviewKeyAction(press(' '), ctx({ revealed: true, deck: leitner }))).toBeNull()
    expect(reviewKeyAction(press(' '), ctx({ revealed: true, deck: undefined }))).toBeNull()
  })

  it('undoes with Ctrl+Z or Cmd+Z everywhere, even in a field or with the dialog open', () => {
    const input = document.createElement('input')
    expect(reviewKeyAction(press('z', { ctrlKey: true }), ctx())).toEqual({ kind: 'undo' })
    expect(reviewKeyAction(press('Z', { metaKey: true, target: input }), ctx())).toEqual({
      kind: 'undo',
    })
    expect(reviewKeyAction(press('z', { ctrlKey: true }), ctx({ infoOpen: true }))).toEqual({
      kind: 'undo',
    })
    expect(reviewKeyAction(press('z'), ctx())).toBeNull()
  })

  it('edits with E and replays with R, before or after the reveal', () => {
    expect(reviewKeyAction(press('e'), ctx())).toEqual({ kind: 'edit' })
    expect(reviewKeyAction(press('E'), ctx({ revealed: true }))).toEqual({ kind: 'edit' })
    expect(reviewKeyAction(press('r'), ctx())).toEqual({ kind: 'replay' })
    expect(reviewKeyAction(press('R'), ctx({ revealed: true }))).toEqual({ kind: 'replay' })
    expect(reviewKeyAction(press('x'), ctx())).toBeNull()
  })

  it('ignores keys typed in a field, with a modifier, or while the dialog is open', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    expect(reviewKeyAction(press('e', { target: input }), ctx())).toBeNull()
    expect(reviewKeyAction(press('Enter', { target: textarea }), ctx())).toBeNull()
    expect(reviewKeyAction(press('1', { target: input }), ctx({ revealed: true }))).toBeNull()
    expect(reviewKeyAction(press('1', { altKey: true }), ctx({ revealed: true }))).toBeNull()
    expect(reviewKeyAction(press('e', { ctrlKey: true }), ctx())).toBeNull()
    expect(reviewKeyAction(press('r', { metaKey: true }), ctx())).toBeNull()
    expect(reviewKeyAction(press(' '), ctx({ infoOpen: true }))).toBeNull()
  })

  it('ignores the key-less keydown that Chrome autofill sends to a field', () => {
    const input = document.createElement('input')
    const autofill = { ctrlKey: false, metaKey: false, altKey: false, target: input }
    // A plain Event, not a KeyboardEvent: `key` is undefined at run time despite its type.
    const keyless = { ...autofill, key: undefined as unknown as string }
    expect(() => reviewKeyAction(keyless, ctx())).not.toThrow()
    expect(reviewKeyAction(keyless, ctx({ revealed: true }))).toBeNull()
  })

  it('replaces the browser default except for edit and replay', () => {
    expect(preventsDefault({ kind: 'undo' })).toBe(true)
    expect(preventsDefault({ kind: 'reveal' })).toBe(true)
    expect(preventsDefault({ kind: 'rate', rating: 3 })).toBe(true)
    expect(preventsDefault({ kind: 'edit' })).toBe(false)
    expect(preventsDefault({ kind: 'replay' })).toBe(false)
  })
})

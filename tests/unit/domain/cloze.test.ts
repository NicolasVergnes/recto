import { describe, expect, it } from 'vitest'
import {
  clozeAnswers,
  clozeIndices,
  nextClozeIndex,
  renderClozeAnswer,
  renderClozeQuestion,
  wrapCloze,
} from '$lib/domain/cloze'

const text = 'La {{c1::Lune}} tourne autour de la {{c2::Terre}} en {{c3::27,3 jours}}.'

describe('cloze', () => {
  it('lists distinct indices, ignoring c0', () => {
    expect(clozeIndices(text)).toEqual([1, 2, 3])
    expect(clozeIndices('{{c2::a}} {{c2::b}} {{c0::x}}')).toEqual([2])
    expect(clozeIndices('pas de trou')).toEqual([])
  })

  it('renders the question with the target hidden and the others shown', () => {
    expect(renderClozeQuestion(text, 2)).toBe(
      'La Lune tourne autour de la <span class="cloze">[…]</span> en 27,3 jours.',
    )
  })

  it('shows the hint on the question side', () => {
    const t = 'Le théorème de {{c1::Pythagore::mathématicien grec}}'
    expect(renderClozeQuestion(t, 1)).toBe(
      'Le théorème de <span class="cloze">[mathématicien grec]</span>',
    )
    expect(renderClozeAnswer(t, 1)).toBe('Le théorème de <span class="cloze">Pythagore</span>')
    expect(clozeAnswers(t, 1)).toEqual(['Pythagore'])
  })

  it('reveals every occurrence of the target index', () => {
    expect(renderClozeAnswer('{{c1::a}} et {{c1::b}}', 1)).toBe(
      '<span class="cloze">a</span> et <span class="cloze">b</span>',
    )
  })

  it('wraps a selection with the next index', () => {
    expect(nextClozeIndex(text)).toBe(4)
    expect(wrapCloze('Paris est la capitale', 0, 5)).toEqual({
      text: '{{c1::Paris}} est la capitale',
      caret: 13,
    })
    expect(wrapCloze('{{c1::a}} b', 10, 11)).toEqual({ text: '{{c1::a}} {{c2::b}}', caret: 19 })
    expect(wrapCloze('ab', 1, 1)).toEqual({ text: 'a{{c1::}}b', caret: 7 })
  })
})

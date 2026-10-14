import { describe, expect, it } from 'vitest'
import { cardOrds, convertFields, normalizeFields, renderCard } from '$lib/domain/notes'
import {
  answerOfFace,
  faceOfAnswer,
  fieldValues,
  referencedFields,
  renameFieldRefs,
  renderTemplate,
  templateOrds,
  typedField,
} from '$lib/domain/templates'
import type { NoteType } from '$lib/domain/types'

/** The « Departements » note type of the Anki deck that motivated M8 (shortened). */
const DEPARTEMENTS: Pick<NoteType, 'fields' | 'templates'> = {
  fields: ['Numero', 'Dept', 'Carte', 'Prefecture', 'Région'],
  templates: [
    {
      name: 'QNumero',
      front: 'Nom du département numéro {{Numero}}<br>{{Carte}}',
      back: '{{Dept}} ({{Numero}})<br>{{Carte}}<br>Préfecture : {{Prefecture}}',
    },
    { name: 'QDept', front: 'Numéro de {{Dept}} ?', back: '{{FrontSide}}<hr id=answer>{{Numero}}' },
    {
      name: 'QCh-lieu',
      front: '{{Prefecture}} est la préfecture de ?',
      back: '{{FrontSide}}<hr id=answer>{{Dept}}',
    },
    {
      name: 'Qcarte',
      front: '{{#Carte}}Quel est ce département ?<br>{{Carte}}{{/Carte}}',
      back: '{{FrontSide}}<hr id=answer>{{Dept}}{{#Région}} — {{Région}}{{/Région}}',
    },
  ],
}
const AIN = ['01', 'Ain', '<img src="ain.png">', 'Bourg-en-Bresse', '']

describe('card templates (Anki syntax subset)', () => {
  const values = fieldValues(DEPARTEMENTS.fields, AIN)

  it('substitutes fields, FrontSide and sections', () => {
    expect(renderTemplate('{{Dept}} ({{Numero}})', values)).toBe('Ain (01)')
    expect(renderTemplate('{{FrontSide}}<hr>{{Dept}}', values, 'Q')).toBe('Q<hr>Ain')
    // FrontSide means nothing on the question side.
    expect(renderTemplate('{{FrontSide}}{{Dept}}', values)).toBe('Ain')
    expect(renderTemplate('{{#Région}}R : {{Région}}{{/Région}}', values)).toBe('')
    expect(renderTemplate('{{^Région}}sans région{{/Région}}', values)).toBe('sans région')
    expect(renderTemplate('{{#Carte}}[{{#Dept}}{{Dept}}{{/Dept}}]{{/Carte}}', values)).toBe('[Ain]')
    // Spaces inside the braces, unknown fields and specials.
    expect(renderTemplate('{{ Dept }}|{{Inconnu}}|{{Tags}}', values)).toBe('Ain||')
  })

  it('applies text: and type:, keeps the value for other filters', () => {
    const v = fieldValues(['A'], ['<b>x</b> & y'])
    expect(renderTemplate('{{text:A}}', v)).toBe('x &amp; y')
    expect(renderTemplate('{{type:A}}', v)).toBe('')
    expect(renderTemplate('{{hint:A}}', v)).toBe('<b>x</b> & y')
    expect(typedField({ front: 'Q {{type:A}}', back: '' })).toBe('A')
    expect(typedField({ front: 'Q', back: '{{type:cloze:A}}' })).toBeNull()
  })

  it('makes a card per template whose question shows note content (Anki rule)', () => {
    expect(templateOrds(DEPARTEMENTS, AIN)).toEqual([0, 1, 2, 3])
    // No map: the « Qcarte » question is empty; no prefecture: « QCh-lieu » shows only static text.
    expect(templateOrds(DEPARTEMENTS, ['01', 'Ain', '', '', ''])).toEqual([0, 1])
    expect(templateOrds(DEPARTEMENTS, [])).toEqual([])
  })

  it('lists and renames field references, whatever the filter or section', () => {
    expect(referencedFields('{{#Carte}}{{text:Dept}}{{/Carte}}{{FrontSide}}')).toEqual([
      'Carte',
      'Dept',
    ])
    expect(
      renameFieldRefs('{{#Dept}}{{text:Dept}} {{Dept}}{{/Dept}} {{Numero}}', 'Dept', 'Nom'),
    ).toBe('{{#Nom}}{{text:Nom}} {{Nom}}{{/Nom}} {{Numero}}')
  })
})

describe('custom notes', () => {
  it('render their templates; the answer replaces the question', () => {
    const note = { modelType: 'custom' as const, fields: AIN }
    const card = renderCard(note, { ord: 1, sideFlipped: true }, true, DEPARTEMENTS)
    expect(card.question).toBe('Numéro de Ain ?')
    expect(card.answer).toBe('Numéro de Ain ?<hr id=answer>01')
    expect(card.answerReplacesQuestion).toBe(true)
    // Leitner never swaps the sides of a template card.
    expect(card.flipped).toBe(false)
    expect(card.expected).toBe('')
    expect(cardOrds({ modelType: 'custom', fields: AIN }, DEPARTEMENTS)).toEqual([0, 1, 2, 3])
    // Without its note type: no card, nothing rendered.
    expect(cardOrds({ modelType: 'custom', fields: AIN })).toEqual([])
    expect(renderCard(note, { ord: 0, sideFlipped: false }).question).toBe('')
  })

  it('normalise and convert their fields by position', () => {
    expect(normalizeFields('custom', ['a'], DEPARTEMENTS)).toEqual(['a', '', '', '', ''])
    expect(normalizeFields('custom', ['a', 'b'])).toEqual(['a', 'b'])
    expect(convertFields('basic', 'custom', ['R', 'V', 'E'], DEPARTEMENTS)).toEqual([
      'R',
      'V',
      'E',
      '',
      '',
    ])
    expect(convertFields('custom', 'basic', AIN)).toEqual(['01', 'Ain', '<img src="ain.png">'])
  })

  it('ask a two-way template by either face, like a basic note (M16)', () => {
    const type: Pick<NoteType, 'fields' | 'templates'> = {
      fields: ['Carte', 'Nom', 'Numéro'],
      templates: [
        { name: 'Carte → Nom', front: '{{Carte}}', back: '{{FrontSide}}<hr id=answer>{{Nom}}' },
        {
          name: 'Nom ↔ Numéro',
          front: '<b>{{Nom}}</b>{{FrontSide}}',
          back: '{{Numéro}}',
          twoWay: true,
        },
      ],
    }
    const note = { modelType: 'custom' as const, fields: ['<img src="ain.png">', 'Ain', '01'] }
    const ask = (sideFlipped: boolean, flip: boolean, ord = 1) => {
      const c = renderCard(note, { ord, sideFlipped }, flip, type)
      return [c.question, c.answer, c.flipped, c.answerReplacesQuestion, c.expected]
    }
    // {{FrontSide}} means nothing in a face: rendered empty.
    expect(ask(false, true)).toEqual(['<b>Ain</b>', '01', false, false, '01'])
    expect(ask(true, true)).toEqual(['01', '<b>Ain</b>', true, false, '<b>Ain</b>'])
    // A deck that does not alternate asks the first face.
    expect(ask(true, false)).toEqual(['<b>Ain</b>', '01', false, false, '01'])
    // A one-way template keeps its side.
    expect(ask(true, true, 0)).toEqual([
      '<img src="ain.png">',
      '<img src="ain.png"><hr id=answer>Ain',
      false,
      true,
      '',
    ])
    // Both faces are questions: the card needs both.
    expect(templateOrds(type, ['<img src="ain.png">', 'Ain', '01'])).toEqual([0, 1])
    expect(templateOrds(type, ['<img src="ain.png">', 'Ain', ''])).toEqual([0])
    expect(templateOrds(type, ['', '', '01'])).toEqual([])
  })

  it('convert an answer into a face and back (M16)', () => {
    expect(faceOfAnswer('{{FrontSide}}<hr id=answer>{{B}}')).toBe('{{B}}')
    expect(faceOfAnswer(' {{ FrontSide }}\n\n<hr id=answer>\n\n<b>{{B}}</b>')).toBe('<b>{{B}}</b>')
    expect(faceOfAnswer('{{FrontSide}}<br>{{B}}')).toBe('<br>{{B}}')
    expect(faceOfAnswer('{{B}} {{FrontSide}}')).toBe('{{B}} {{FrontSide}}')
    expect(answerOfFace('{{B}}')).toBe('{{FrontSide}}\n\n<hr id=answer>\n\n{{B}}')
    expect(faceOfAnswer(answerOfFace('{{B}}'))).toBe('{{B}}')
  })
})

import { describe, expect, it } from 'vitest'
import { areTwins } from '$lib/domain/notes'

/** The four templates of the « Les départements français » deck, reduced to their fields. */
const departements = {
  fields: ['Numero', 'Dept', 'Carte', 'Prefecture', 'Région'],
  templates: [
    {
      name: 'QNumero',
      front: 'Nom du département dont le numéro est {{Numero}}<br>{{Carte}}',
      back: '{{Dept}} ({{Numero}})<br>{{Carte}}<br>Préfecture : {{Prefecture}}',
    },
    {
      name: 'QDept',
      front: 'Numéro du département {{Dept}} ?<br>{{Carte}}',
      back: '{{Numero}} ({{Dept}})<br>{{Carte}}<br>Sa préfecture est {{Prefecture}}',
    },
    {
      name: 'QCh-lieu',
      front: '{{Prefecture}} est la préfecture de ?<br>{{Carte}}',
      back: '{{Numero}} {{Dept}} ({{Prefecture}})<br>{{Carte}}',
    },
    {
      name: 'Qcarte',
      front: 'Quel est ce département ?<br>{{Carte}}',
      back: '({{Numero}}) {{Dept}}<br>et sa préfecture est {{Prefecture}}<br>{{Carte}}',
    },
  ],
}

describe('areTwins (03 §5.2)', () => {
  it('never pairs a card with itself', () => {
    expect(areTwins('basic', 0, 0)).toBe(false)
    expect(areTwins('cloze', 1, 1)).toBe(false)
  })

  it('keeps cloze and occlusion siblings twins: they reveal each other', () => {
    expect(areTwins('cloze', 0, 2)).toBe(true)
    expect(areTwins('image_occlusion', 0, 1)).toBe(true)
  })

  it('pairs custom cards that ask what the other answers, both ways', () => {
    const twins = (a: number, b: number) => areTwins('custom', a, b, departements)
    expect(twins(0, 1)).toBe(true) // numéro → nom, nom → numéro
    expect(twins(0, 2)).toBe(true) // numéro → préfecture, préfecture → numéro
    expect(twins(1, 2)).toBe(true)
    expect(twins(3, 0)).toBe(false) // carte → nom and numéro → nom: the same day is fine
    expect(twins(3, 1)).toBe(false)
    expect(twins(3, 2)).toBe(false)
  })

  it('ignores {{FrontSide}} and treats a missing template or type as no twin', () => {
    const type = {
      fields: ['A', 'B'],
      templates: [
        { name: '1', front: '{{A}}', back: '{{FrontSide}}<hr>{{B}}' },
        { name: '2', front: '{{B}}', back: '{{FrontSide}}<hr>{{A}}' },
      ],
    }
    expect(areTwins('custom', 0, 1, type)).toBe(true)
    expect(areTwins('custom', 0, 5, type)).toBe(false)
    expect(areTwins('custom', 0, 1)).toBe(false)
  })

  it('pairs two-way cards through the fields of both faces (M16)', () => {
    const type = {
      fields: ['Carte', 'Nom', 'Numéro', 'Préfecture'],
      templates: [
        { name: 'Carte → Nom', front: '{{Carte}}', back: '{{FrontSide}}<hr id=answer>{{Nom}}' },
        { name: 'Nom ↔ Numéro', front: '{{Nom}}', back: '{{Numéro}}', twoWay: true },
        { name: 'Nom ↔ Préfecture', front: '{{Nom}}', back: '{{Préfecture}}', twoWay: true },
        { name: 'Numéro → Carte', front: '{{Numéro}}', back: '{{FrontSide}}<hr>{{Carte}}' },
      ],
    }
    const twins = (a: number, b: number) => areTwins('custom', a, b, type)
    expect(twins(1, 2)).toBe(true) // both show and ask the name
    expect(twins(0, 1)).toBe(false) // the map is never shown by nom ↔ numéro
    expect(twins(0, 2)).toBe(false)
    expect(twins(1, 3)).toBe(false) // numéro → carte never answers nom nor numéro
  })
})

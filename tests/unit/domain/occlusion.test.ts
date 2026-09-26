import { describe, expect, it } from 'vitest'
import {
  addMask,
  maskLabels,
  MIN_MASK_SIZE,
  moveMask,
  nextMaskGroup,
  normalizeMask,
  occlusionFromAnki,
  occlusionGroups,
  occlusionOrds,
  occlusionToAnki,
  parseOcclusion,
  rectFromPoints,
  removeMask,
  resizeMask,
  serializeOcclusion,
  updateMask,
  type Occlusion,
} from '$lib/domain/occlusion'

const sample: Occlusion = {
  mode: 'hideAll',
  masks: [
    { n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: 'Paris' },
    { n: 3, x: 0.5, y: 0.5, w: 0.25, h: 0.125 },
    { n: 3, x: 0, y: 0, w: 0.05, h: 0.05, label: 'Lyon' },
  ],
}

describe('occlusion masks', () => {
  it('round-trips through the stored JSON', () => {
    const json = serializeOcclusion(sample)
    expect(JSON.parse(json)).toMatchObject({ v: 1, mode: 'hideAll' })
    expect(parseOcclusion(json)).toEqual(sample)
  })

  it('reads empty, invalid or foreign JSON as no masks', () => {
    for (const json of ['', 'nope', 'null', '[]', '{"masks": 3}', '{"mode":"x"}']) {
      expect(parseOcclusion(json)).toEqual({ mode: 'hideAll', masks: [] })
    }
    expect(parseOcclusion('{"mode":"hideOne","masks":[]}').mode).toBe('hideOne')
  })

  it('clamps masks to the image, rounds them and drops invalid ones', () => {
    expect(normalizeMask({ n: 1, x: -0.2, y: 0.9, w: 0.5, h: 0.5 })).toEqual({
      n: 1,
      x: 0,
      y: 0.9,
      w: 0.3,
      h: 0.1,
    })
    expect(normalizeMask({ n: 2, x: 0.123456, y: 0.1, w: 0.2, h: 0.2, label: '  ' })).toEqual({
      n: 2,
      x: 0.1235,
      y: 0.1,
      w: 0.2,
      h: 0.2,
    })
    expect(normalizeMask({ n: 0, x: 0, y: 0, w: 1, h: 1 })).toBeNull()
    expect(normalizeMask({ n: 1.5, x: 0, y: 0, w: 1, h: 1 })).toBeNull()
    expect(normalizeMask({ n: 1, x: Number.NaN, y: 0, w: 1, h: 1 })).toBeNull()
    expect(normalizeMask({ n: 1, x: 0.5, y: 0.5, w: 0.001, h: 0.3 })).toBeNull()
    expect(normalizeMask({ n: 1, x: 1.2, y: 0, w: 0.3, h: 0.3 })).toBeNull()
    const parsed = parseOcclusion(
      JSON.stringify({
        masks: [
          { n: '2', x: '0.1', y: 0.1, w: 0.2, h: 0.2, label: 7 },
          'junk',
          { n: 1, x: 0, y: 0, w: 0, h: 0.2 },
        ],
      }),
    )
    expect(parsed.masks).toEqual([{ n: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }])
  })

  it('gives one card per group, ord = group - 1', () => {
    expect(occlusionGroups(sample)).toEqual([1, 3])
    expect(occlusionOrds(sample)).toEqual([0, 2])
    expect(occlusionOrds({ mode: 'hideAll', masks: [] })).toEqual([])
    expect(nextMaskGroup(sample)).toBe(4)
    expect(nextMaskGroup({ mode: 'hideOne', masks: [] })).toBe(1)
  })

  it('lists the labels of a group in drawing order', () => {
    expect(maskLabels(sample, 1)).toEqual(['Paris'])
    expect(maskLabels(sample, 3)).toEqual(['Lyon'])
    expect(maskLabels(sample, 2)).toEqual([])
    const twice: Occlusion = {
      mode: 'hideAll',
      masks: [
        { n: 1, x: 0, y: 0, w: 0.1, h: 0.1, label: 'b' },
        { n: 1, x: 0.2, y: 0, w: 0.1, h: 0.1, label: 'a' },
        { n: 1, x: 0.4, y: 0, w: 0.1, h: 0.1, label: 'b' },
      ],
    }
    expect(maskLabels(twice, 1)).toEqual(['b', 'a'])
  })
})

describe('Anki image occlusion field', () => {
  it('writes the syntax of Anki 23.10+ (checked with the Anki backend)', () => {
    expect(occlusionToAnki(sample)).toBe(
      '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}<br>' +
        '{{c3::image-occlusion:rect:left=.5:top=.5:width=.25:height=.125:oi=1}}<br>' +
        '{{c3::image-occlusion:rect:left=0:top=0:width=.05:height=.05:oi=1}}',
    )
    expect(occlusionToAnki({ mode: 'hideOne', masks: [{ n: 2, x: 1, y: 0, w: 0, h: 1 }] })).toBe(
      '{{c2::image-occlusion:rect:left=1:top=0:width=0:height=1}}',
    )
  })

  it('reads back what it writes (labels excepted)', () => {
    const back = occlusionFromAnki(occlusionToAnki(sample))
    expect(back.converted).toBe(0)
    expect(back.skipped).toBe(0)
    expect(back.occlusion).toEqual({
      mode: 'hideAll',
      masks: sample.masks.map(({ n, x, y, w, h }) => ({ n, x, y, w, h })),
    })
    expect(occlusionFromAnki(occlusionToAnki({ ...sample, mode: 'hideOne' })).occlusion.mode).toBe(
      'hideOne',
    )
  })

  it('converts ellipses and polygons to rectangles, skips rotated shapes and the rest', () => {
    const text = [
      '{{c1::image-occlusion:ellipse:left=.1:top=.1:rx=.05:ry=.1:oi=1}}',
      '{{c2::image-occlusion:polygon:points=.1,.1 .3,.2 .2,.4:oi=1}}',
      '{{c3::image-occlusion:rect:left=.5:top=.5:width=.1:height=.1:angle=30:fill=#ffeba2}}',
      '{{c0::image-occlusion:text:left=.1:top=.1:text=Titre\\: 1:scale=1:fs=.05}}',
      '{{c4::image-occlusion:rect:left=120:top=40:width=30:height=20}}',
      '{{c5::image-occlusion:rect:left=.1:top=.1}}',
      '{{c6::autre chose}}',
    ].join('<br>')
    const { occlusion, converted, skipped } = occlusionFromAnki(text)
    expect(occlusion.mode).toBe('hideAll')
    // The rotated rectangle (c3) is left out: without the image's aspect ratio, no normalised
    // rectangle is sure to cover it (P1).
    expect(occlusion.masks).toEqual([
      { n: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.2 },
      { n: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
    ])
    expect(converted).toBe(2)
    expect(skipped).toBe(4)
  })

  it('unescapes colons and backslashes in values', () => {
    const { occlusion } = occlusionFromAnki(
      '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:note=a\\:b\\\\c}}',
    )
    expect(occlusion.masks).toEqual([{ n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }])
    expect(occlusion.mode).toBe('hideOne')
  })
})

describe('mask answers in Anki Comments', () => {
  it('writes one line per labelled group and reads it back', async () => {
    const { labelsFromAnkiComments, labelsToAnkiComments } = await import('$lib/domain/occlusion')
    const labelled: Occlusion = {
      mode: 'hideAll',
      masks: [
        { n: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.1, label: 'a < b' },
        { n: 2, x: 0.3, y: 0.1, w: 0.1, h: 0.1 },
        { n: 2, x: 0.5, y: 0.1, w: 0.1, h: 0.1, label: 'Lyon' },
        { n: 3, x: 0.7, y: 0.1, w: 0.1, h: 0.1 },
      ],
    }
    const comments = labelsToAnkiComments(labelled)
    expect(comments).toBe('1 : a &lt; b<br>2 : Lyon')
    const bare: Occlusion = { ...labelled, masks: labelled.masks.map(({ label: _, ...m }) => m) }
    // Each answer goes back to the first mask of its group.
    expect(labelsFromAnkiComments(bare, comments)?.masks.map((m) => m.label)).toEqual([
      'a < b',
      'Lyon',
      undefined,
      undefined,
    ])
    expect(labelsToAnkiComments(bare)).toBe('')
    // Anything else in Comments is a comment written in Anki: not answers.
    expect(labelsFromAnkiComments(bare, 'Voir le manuel')).toBeNull()
    expect(labelsFromAnkiComments(bare, '1 : Paris<br>une remarque')).toBeNull()
    expect(labelsFromAnkiComments(bare, '')).toBeNull()
  })
})

describe('mask editing', () => {
  const empty: Occlusion = { mode: 'hideAll', masks: [] }

  it('turns a drag into a rectangle inside the image', () => {
    expect(rectFromPoints({ x: 0.6, y: 0.9 }, { x: 0.2, y: 1.4 })).toEqual({
      x: 0.2,
      y: 0.9,
      w: 0.4,
      h: 0.1,
    })
  })

  it('adds masks in new groups, or in a given group, and ignores tiny ones', () => {
    const one = addMask(empty, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
    const two = addMask(one, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })
    const grouped = addMask(two, { x: 0.7, y: 0.1, w: 0.1, h: 0.1 }, 1)
    expect(grouped.masks.map((m) => m.n)).toEqual([1, 2, 1])
    expect(addMask(two, { x: 0.5, y: 0.5, w: 0.001, h: 0.2 })).toBe(two)
  })

  it('updates, relabels, regroups and removes masks', () => {
    const o = addMask(addMask(empty, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }), {
      x: 0.5,
      y: 0.5,
      w: 0.2,
      h: 0.2,
    })
    const labelled = updateMask(o, 1, { label: ' Lyon ' })
    expect(labelled.masks[1]).toMatchObject({ n: 2, label: 'Lyon' })
    expect(updateMask(labelled, 1, { label: '  ' }).masks[1]).not.toHaveProperty('label')
    expect(updateMask(o, 1, { n: 1 }).masks.map((m) => m.n)).toEqual([1, 1])
    expect(updateMask(o, 1, { n: 0 })).toBe(o)
    expect(updateMask(o, 5, { n: 3 })).toBe(o)
    expect(removeMask(o, 0).masks).toEqual([o.masks[1]])
  })

  it('moves and resizes masks within the image', () => {
    const m = { n: 1, x: 0.8, y: 0.1, w: 0.15, h: 0.2 }
    expect(moveMask(m, 0.1, -0.2)).toEqual({ n: 1, x: 0.85, y: 0, w: 0.15, h: 0.2 })
    expect(moveMask(m, -1, 0.01)).toEqual({ n: 1, x: 0, y: 0.11, w: 0.15, h: 0.2 })
    expect(resizeMask(m, 0.5, -1)).toEqual({ n: 1, x: 0.8, y: 0.1, w: 0.2, h: MIN_MASK_SIZE })
    expect(resizeMask(m, 0.01, 0.01)).toEqual({ n: 1, x: 0.8, y: 0.1, w: 0.16, h: 0.21 })
  })
})

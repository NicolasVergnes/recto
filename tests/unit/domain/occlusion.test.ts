import { describe, expect, it } from 'vitest'
import {
  maskLabels,
  nextMaskGroup,
  normalizeMask,
  occlusionFromAnki,
  occlusionGroups,
  occlusionOrds,
  occlusionToAnki,
  parseOcclusion,
  serializeOcclusion,
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

  it('converts ellipses, polygons and rotated shapes to rectangles, skips the rest', () => {
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
    expect(occlusion.masks).toEqual([
      { n: 1, x: 0.1, y: 0.1, w: 0.1, h: 0.2 },
      { n: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
      { n: 3, x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
    ])
    expect(converted).toBe(3)
    expect(skipped).toBe(3)
  })

  it('unescapes colons and backslashes in values', () => {
    const { occlusion } = occlusionFromAnki(
      '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:note=a\\:b\\\\c}}',
    )
    expect(occlusion.masks).toEqual([{ n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }])
    expect(occlusion.mode).toBe('hideOne')
  })
})

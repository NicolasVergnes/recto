import { describe, expect, it } from 'vitest'
import { SLOTS, targetField, type FieldSlot } from '$lib/ui/editor/slots'

/** A type whose field 0 is not a text field (e.g. an image edited elsewhere). */
const custom: readonly FieldSlot[] = [
  { label: 'editor.text', index: 1 },
  { label: 'editor.extra', index: 2 },
]

describe('editor field slots', () => {
  it('lists every note field of the current types, main text first', () => {
    expect(SLOTS.basic.map((s) => s.index)).toEqual([0, 1, 2])
    expect(SLOTS.basic_reverse).toBe(SLOTS.basic)
    expect(SLOTS.cloze.map((s) => s.index)).toEqual([0, 1])
    // Occlusion: image and masks (0–1) belong to the mask editor, never to the text form.
    expect(SLOTS.image_occlusion.map((s) => s.index)).toEqual([2, 3])
    expect(targetField(SLOTS.image_occlusion, 4, undefined)).toBe(2)
    expect(targetField(SLOTS.image_occlusion, 4, 0)).toBe(2)
    expect(targetField(SLOTS.image_occlusion, 4, 3)).toBe(3)
  })

  it('targets the last focused field, or the first slot before any focus', () => {
    expect(targetField(SLOTS.basic, 3, undefined)).toBe(0)
    expect(targetField(SLOTS.basic, 3, 1)).toBe(1)
    expect(targetField(SLOTS.basic, 3, 2)).toBe(2)
    expect(targetField(custom, 3, undefined)).toBe(1)
    expect(targetField(custom, 3, 2)).toBe(2)
  })

  it('clamps to the last field after basic → cloze, as before the split', () => {
    expect(targetField(SLOTS.cloze, 2, 2)).toBe(1)
  })

  it('never targets a field that is not shown', () => {
    expect(targetField(custom, 3, 0)).toBe(1)
    expect(targetField(custom, 2, 2)).toBe(1)
    expect(targetField([], 3, 2)).toBe(0)
  })
})

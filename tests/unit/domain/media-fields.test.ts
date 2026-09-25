import { describe, expect, it } from 'vitest'
import {
  imageRefs,
  imageTag,
  insertAt,
  removeImage,
  removeSound,
  renameMediaRefs,
  setImageAlt,
} from '$lib/domain/text'

describe('field media editing', () => {
  const html =
    'Q <img src="a.png" alt="Un A"> <img alt=\'b\' src="b.webp"> <img src="http://x/y.png"> [sound:s.mp3]'

  it('lists local images with alt text', () => {
    expect(imageRefs(html)).toEqual([
      { name: 'a.png', alt: 'Un A' },
      { name: 'b.webp', alt: 'b' },
    ])
    expect(imageRefs('<img src="c.png">')).toEqual([{ name: 'c.png', alt: '' }])
  })

  it('edits alt text, removes images and sounds', () => {
    expect(imageTag('x "y".png', 'a<b')).toBe('<img src="x &quot;y&quot;.png" alt="a&lt;b">')
    expect(setImageAlt(html, 'a.png', 'Nouveau')).toContain('<img src="a.png" alt="Nouveau">')
    expect(removeImage(html, 'b.webp')).not.toContain('b.webp')
    expect(removeSound(html, 's.mp3')).not.toContain('[sound:')
    expect(removeSound(html, 'other.mp3')).toBe(html)
  })

  it('renames media references', () => {
    const out = renameMediaRefs(html, 'a.png', 'a-2.png')
    expect(out).toContain('<img src="a-2.png" alt="Un A">')
    expect(renameMediaRefs('[sound:s.mp3]', 's.mp3', 's-2.mp3')).toBe('[sound:s-2.mp3]')
  })

  it('inserts at the caret', () => {
    expect(insertAt('abcd', 1, 3, 'XY')).toEqual({ text: 'aXYd', caret: 3 })
  })
})

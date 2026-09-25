import { describe, expect, it } from 'vitest'
import {
  atomicityWarnings,
  decodeEntities,
  escapeHtml,
  extractSounds,
  isRemoteUrl,
  mediaRefs,
  normalizeText,
  parseTags,
  stripHtml,
} from '$lib/domain/text'

describe('text helpers', () => {
  it('strips HTML and decodes entities', () => {
    expect(stripHtml('<b>Bonjour</b>&nbsp;le<br>monde &amp; co [sound:a.mp3]')).toBe(
      'Bonjour le monde & co',
    )
    expect(decodeEntities('&#233;&#xE9;&unknown;&#0;')).toBe('éé&unknown;&#0;')
  })

  it('normalises for duplicate detection', () => {
    expect(normalizeText('  <i>Département</i>   01 ')).toBe('département 01')
    expect(normalizeText('E\u0301te\u0301')).toBe(normalizeText('Été'))
  })

  it('escapes HTML', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  it('parses tags', () => {
    expect(parseTags('  geo  france geo\tdepartements ')).toEqual(['geo', 'france', 'departements'])
    expect(parseTags('')).toEqual([])
  })

  it('warns about long fields (P8)', () => {
    expect(atomicityWarnings('a'.repeat(200))).toEqual([])
    expect(atomicityWarnings('a'.repeat(201))).toEqual(['tooLong'])
    expect(atomicityWarnings(`<b>${'a'.repeat(200)}</b>`)).toEqual([])
  })

  it('warns about lists (P8) but not decimals', () => {
    expect(atomicityWarnings('a, b, c, d, e')).toEqual([])
    expect(atomicityWarnings('a, b, c, d, e, f')).toEqual(['looksLikeList'])
    expect(atomicityWarnings('27,3 et 1,5 et 2,5 et 3,5 et 4,5 et 5,5')).toEqual([])
    expect(atomicityWarnings('<ul>' + '<li>x</li>'.repeat(5) + '</ul>')).toEqual(['looksLikeList'])
    expect(atomicityWarnings('<ul>' + '<li>x</li>'.repeat(4) + '</ul>')).toEqual([])
    expect(atomicityWarnings('- a\n- b\n- c\n- d\n- e')).toEqual(['looksLikeList'])
    expect(atomicityWarnings('1. a<br>2. b<br>3. c<br>4. d<br>5) e')).toEqual(['looksLikeList'])
  })

  it('finds local media references', () => {
    const html =
      '<img src="a.png"> <img alt="x" src=\'b.webp\'> <img src=c.gif> <img src="https://x/y.png"> [sound:s.mp3] [sound:s.mp3] <img src="a.png">'
    expect(mediaRefs(html)).toEqual({ images: ['a.png', 'b.webp', 'c.gif'], sounds: ['s.mp3'] })
    expect(isRemoteUrl('//cdn/x.png')).toBe(true)
    expect(isRemoteUrl('data:image/png;base64,xx')).toBe(true)
    expect(isRemoteUrl('flag-fr.svg')).toBe(false)
  })

  it('extracts sounds', () => {
    expect(extractSounds('Bonjour [sound:a.mp3] [sound: b.ogg ]')).toEqual({
      html: 'Bonjour  ',
      sounds: ['a.mp3', 'b.ogg'],
    })
  })
})

describe('frontKey', () => {
  it('keeps media names so image-only fronts differ', async () => {
    const { frontKey } = await import('$lib/domain/text')
    expect(frontKey('<img src="flag-fr.svg">')).not.toBe(frontKey('<img src="flag-de.svg">'))
    expect(frontKey(' <b>Chien</b> ')).toBe(frontKey('chien'))
    expect(frontKey('<b></b>')).toBe('')
  })
})

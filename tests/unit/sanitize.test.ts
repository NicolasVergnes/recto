// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitize } from '$lib/sanitize'

describe('sanitize()', () => {
  it('keeps the whitelist and strips everything else', () => {
    expect(sanitize('<b>a</b><i>b</i><u>c</u><sub>d</sub><sup>e</sup><ul><li>f</li></ul>')).toBe(
      '<b>a</b><i>b</i><u>c</u><sub>d</sub><sup>e</sup><ul><li>f</li></ul>',
    )
    expect(sanitize('<script>alert(1)</script>ok')).toBe('ok')
    expect(sanitize('<a href="javascript:x" onclick="y">lien</a>')).toBe('lien')
    expect(sanitize('<span class="cloze" style="color:red" data-x="1">t</span>')).toBe(
      '<span class="cloze">t</span>',
    )
  })

  it('never lets images load by themselves', () => {
    expect(sanitize('<img src="lune.png" alt="La Lune" onerror="x()">')).toBe(
      '<img alt="La Lune" data-media="lune.png">',
    )
    expect(sanitize('<img src="https://example.com/a.png">')).toBe(
      '<img data-media="https://example.com/a.png">',
    )
  })

  it('maps common Anki markup onto the whitelist', () => {
    expect(sanitize('<div>un</div><div><strong>deux</strong> <em>trois</em></div>')).toBe(
      'un<br><b>deux</b> <i>trois</i><br>',
    )
  })
})

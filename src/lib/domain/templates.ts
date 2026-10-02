/**
 * Card templates of a custom note type (02 §2.2, ADR-010): the subset of Anki's template syntax
 * that Anki decks use. Pure; the result is HTML to sanitise like any field.
 *
 * - `{{Champ}}` the field's HTML; `{{FrontSide}}` the rendered question (answer side only);
 * - `{{#Champ}}…{{/Champ}}` kept when the field is not empty, `{{^Champ}}…{{/Champ}}` when it is;
 * - filters, applied right to left: `text:` (HTML removed), `type:` (typed answer: rendered as
 *   nothing, Recto compares the answer itself), any other (`hint:`, `furigana:`…) the value;
 * - an unknown field or special (`{{Tags}}`, `{{Deck}}`…) renders as nothing.
 */
import { escapeHtml, stripHtml } from './text'
import type { CardTemplate, NoteType } from './types'

export type FieldValues = ReadonlyMap<string, string>

const TAG = /\{\{\s*([^{}]*?)\s*\}\}/g
/** An innermost section: its body opens no other section. */
const SECTION = /\{\{\s*([#^])\s*([^{}]+?)\s*\}\}((?:(?!\{\{\s*[#^])[\s\S])*?)\{\{\s*\/\s*\2\s*\}\}/

/** Field name → HTML, by position (a missing value is empty). */
export function fieldValues(names: readonly string[], fields: readonly string[]): FieldValues {
  return new Map(names.map((name, i) => [name, fields[i] ?? '']))
}

/** Anki's notion of an empty field: no text, image nor sound once the markup is removed. */
export function isEmptyField(html: string): boolean {
  return stripHtml(html) === '' && !/<img\b/i.test(html) && !/\[sound:/.test(html)
}

function substitute(tag: string, values: FieldValues, frontSide: string): string {
  const parts = tag.split(':').map((p) => p.trim())
  const name = parts.pop() ?? ''
  if (name === 'FrontSide' && parts.length === 0) return frontSide
  const value = values.get(name)
  if (value === undefined) return ''
  let out = value
  for (const filter of parts.reverse()) {
    if (filter === 'type') return ''
    if (filter === 'text') out = escapeHtml(stripHtml(out))
  }
  return out
}

/** Renders one side. `frontSide` is what `{{FrontSide}}` stands for (the answer side only). */
export function renderTemplate(template: string, values: FieldValues, frontSide = ''): string {
  let html = template
  // Innermost sections first; each pass removes at least one, so this ends.
  for (let match = SECTION.exec(html); match; match = SECTION.exec(html)) {
    const [whole, kind, name = '', body = ''] = match
    const filled = !isEmptyField(values.get(name) ?? '')
    const keep = kind === '#' ? filled : !filled
    html = html.slice(0, match.index) + (keep ? body : '') + html.slice(match.index + whole.length)
  }
  return html.replace(TAG, (_, tag: string) =>
    /^[#^/]/.test(tag) ? '' : substitute(tag, values, frontSide),
  )
}

/**
 * Templates that make a card (Anki's rule): the question must show something that comes from
 * the note, i.e. not be empty and differ from the question rendered with every field empty.
 */
export function templateOrds(
  type: Pick<NoteType, 'fields' | 'templates'>,
  fields: readonly string[],
): number[] {
  const values = fieldValues(type.fields, fields)
  const blank = fieldValues(type.fields, [])
  const ords: number[] = []
  type.templates.forEach((t, ord) => {
    const front = renderTemplate(t.front, values)
    if (!isEmptyField(front) && front !== renderTemplate(t.front, blank)) ords.push(ord)
  })
  return ords
}

/** The field a template asks to type (`{{type:Champ}}`, question first), or null. */
export function typedField(template: Pick<CardTemplate, 'front' | 'back'>): string | null {
  for (const side of [template.front, template.back]) {
    for (const [, tag = ''] of side.matchAll(TAG)) {
      const parts = tag.split(':').map((p) => p.trim())
      if (parts[0] === 'type' && parts.length === 2 && parts[1]) return parts[1]
    }
  }
  return null
}

/** Field names used by a template side (any filter), for Anki's `req` and the editor help. */
export function referencedFields(template: string): string[] {
  const names = new Set<string>()
  for (const [, tag = ''] of template.matchAll(TAG)) {
    const name =
      tag
        .replace(/^[#^/]\s*/, '')
        .split(':')
        .pop()
        ?.trim() ?? ''
    if (name && name !== 'FrontSide') names.add(name)
  }
  return [...names]
}

/** Rewrites the references to field `from` (with any filter or section) as `to`. */
export function renameFieldRefs(template: string, from: string, to: string): string {
  return template.replace(TAG, (whole, tag: string) => {
    const m = /^([#^/]?\s*)((?:[^:{}]*:)*)\s*([^:{}]*)$/.exec(tag)
    if (!m || m[3]?.trim() !== from) return whole
    return `{{${m[1] ?? ''}${m[2] ?? ''}${to}}}`
  })
}

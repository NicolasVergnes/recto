/**
 * Card templates of a custom note type (02 §2.2, ADR-010): the subset of Anki's template syntax
 * that Anki decks use. Pure; the result is HTML to sanitise like any field.
 *
 * - `{{Champ}}` the field's HTML; `{{FrontSide}}` the rendered question (answer side only);
 * - `{{#Champ}}…{{/Champ}}` kept when the field is not empty, `{{^Champ}}…{{/Champ}}` when it is;
 * - filters, applied right to left: `text:` (HTML removed), `type:` (typed answer: rendered as
 *   nothing, Recto compares the answer itself), any other (`hint:`, `furigana:`…) the value;
 * - an unknown field or special (`{{Tags}}`, `{{Deck}}`…) renders as nothing.
 *
 * Cards of kind cloze and occlusion (M14) read their text or image from `template.field`.
 */
import { clozeIndices } from './cloze'
import { occlusionGroups, parseOcclusion } from './occlusion'
import { escapeHtml, imageRefs, stripHtml } from './text'
import type { CardKind, CardTemplate, NoteType } from './types'

/**
 * Card ords of a custom note (M14): template index + ORD_STRIDE × sub-index, the sub-index being
 * the cloze index or mask group - 1 (0 for a classic or single card). Cards stored before M14 all
 * have a sub-index of 0: their ord is unchanged.
 */
export const ORD_STRIDE = 1000
export const customOrd = (template: number, sub = 0): number => template + ORD_STRIDE * sub
export const templateIndex = (ord: number): number => ord % ORD_STRIDE
export const subIndex = (ord: number): number => Math.floor(ord / ORD_STRIDE)

/** A template's kind: absent means classic. */
export const kindOf = (template: Pick<CardTemplate, 'kind'>): CardKind => template.kind ?? 'classic'

/** Indices of the fields holding the cloze text or the image of a card of `kind`, ascending. */
export function sourceFields(
  type: Pick<NoteType, 'fields' | 'templates'>,
  kind: Exclude<CardKind, 'classic'>,
): number[] {
  const names = new Set(type.templates.filter((t) => kindOf(t) === kind).map((t) => t.field))
  return type.fields.flatMap((name, i) => (names.has(name) ? [i] : []))
}

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
 * Cards of a custom note (02 §3 invariant 2). A classic template makes a card when its question
 * shows something that comes from the note (Anki's rule: not empty and different from the
 * question rendered with every field empty). A cloze template makes one card per index of its
 * field, an occlusion template one per mask group when its field has an image (`masks`: the
 * note's, aligned with `fields`); `single`, one card when there is at least one.
 */
export function templateOrds(
  type: Pick<NoteType, 'fields' | 'templates'>,
  fields: readonly string[],
  masks: readonly string[] = [],
): number[] {
  const values = fieldValues(type.fields, fields)
  const blank = fieldValues(type.fields, [])
  return type.templates.flatMap((t, i) => {
    const kind = kindOf(t)
    if (kind === 'classic') {
      const front = renderTemplate(t.front, values)
      return !isEmptyField(front) && front !== renderTemplate(t.front, blank) ? [i] : []
    }
    const at = type.fields.indexOf(t.field ?? '')
    const source = fields[at] ?? ''
    const subs =
      kind === 'cloze'
        ? clozeIndices(source)
        : imageRefs(source).length > 0
          ? occlusionGroups(parseOcclusion(masks[at] ?? ''))
          : []
    if (subs.length === 0) return []
    return t.single ? [i] : subs.map((n) => customOrd(i, n - 1))
  })
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

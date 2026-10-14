import { editOf, fieldUsers, storedTemplate, type NoteTypeEdit } from '$lib/domain/note-types'
import type { TypeShape } from '$lib/domain/notes'
import { renameFieldRefs } from '$lib/domain/templates'
import type { CardKind, NoteType } from '$lib/domain/types'
import { t } from '$lib/i18n'

/**
 * Swaps entry `i` with its neighbour, above (`by` -1) or below (1), and returns where the entry
 * is now (`i` itself at an end). The entry travels whole, with its `from`.
 */
function swapWithNeighbour<T>(list: T[], i: number, by: -1 | 1): number {
  const j = i + by
  const entry = list[i]
  const neighbour = list[j]
  if (entry === undefined || neighbour === undefined) return i
  list[i] = neighbour
  list[j] = entry
  return j
}

/** A note type being edited: its fields and templates, each remembering where it came from. */
export class NoteTypeDraft {
  edit = $state<NoteTypeEdit>({ name: '', fields: [], templates: [] })

  /** As it would be saved, for the preview. */
  readonly shape: TypeShape = $derived({
    fields: this.edit.fields.map((f) => f.name.trim()),
    templates: this.edit.templates.map(storedTemplate),
  })

  load(type: NoteType): void {
    this.edit = editOf(type)
  }

  /**
   * Renames field `i` and the references to it in every template, unless the new or the old name
   * is empty or shared with another field (case-insensitive, like the validation): no reference
   * is merged nor taken from another field, and saving reports what is left to fix.
   */
  renameField(i: number, next: string): void {
    const field = this.edit.fields[i]
    if (!field) return
    const old = field.name.trim()
    const name = next.trim()
    field.name = next
    const shared = (n: string) =>
      this.edit.fields.some((f, j) => j !== i && f.name.trim().toLowerCase() === n.toLowerCase())
    if (!name || !old || name === old || shared(name) || shared(old)) return
    for (const tpl of this.edit.templates) {
      tpl.front = renameFieldRefs(tpl.front, old, name)
      tpl.back = renameFieldRefs(tpl.back, old, name)
      if (tpl.field?.trim() === old) tpl.field = name
    }
  }

  addField(): void {
    const names = this.edit.fields.map((f) => f.name.trim())
    let n = this.edit.fields.length + 1
    while (names.includes(t('noteTypes.newField', { n }))) n++
    this.edit.fields.push({ name: t('noteTypes.newField', { n }), from: null })
  }

  /**
   * Removes field `i`, unless a template uses it: returns those templates' names (nothing is
   * removed then, M11), else an empty list.
   */
  removeField(i: number): string[] {
    const field = this.edit.fields[i]
    if (!field || this.edit.fields.length === 1) return []
    const users = fieldUsers(this.shape.templates, field.name)
    if (users.length === 0) this.edit.fields.splice(i, 1)
    return users
  }

  /**
   * Moves field `i` one place up (`by` -1) or down (1) and returns its new index. Nothing else
   * changes: the templates name their fields, and saving moves each note's values by `from`.
   */
  moveField(i: number, by: -1 | 1): number {
    return swapWithNeighbour(this.edit.fields, i, by)
  }

  /** A new card asks the first field and answers with the second. */
  addTemplate(): void {
    this.edit.templates.push({
      name: t('noteTypes.newCard', { n: this.edit.templates.length + 1 }),
      ...this.classicSides(),
      from: null,
    })
  }

  private classicSides(): { front: string; back: string } {
    const [first = '', second = first] = this.shape.fields
    return { front: `{{${first}}}`, back: `{{FrontSide}}<hr id=answer>{{${second}}}` }
  }

  /**
   * Gives template `i` another kind of card (M14), starting from empty sides: a classic card asks
   * the first field, a cloze or occlusion card reads the first field. Its cards are replaced on
   * saving (`planNoteTypeEdit`), unless it goes back to its stored kind and field.
   */
  setKind(i: number, kind: CardKind): void {
    const template = this.edit.templates[i]
    if (!template || (template.kind ?? 'classic') === kind) return
    delete template.single
    if (kind === 'classic') {
      delete template.kind
      delete template.field
      Object.assign(template, this.classicSides())
      return
    }
    template.kind = kind
    template.field = this.shape.fields[0] ?? ''
    template.front = ''
    template.back = ''
  }

  removeTemplate(i: number): void {
    if (this.edit.templates.length > 1) this.edit.templates.splice(i, 1)
  }

  /** Moves template `i` one place up or down and returns its new index; saving moves its cards. */
  moveTemplate(i: number, by: -1 | 1): number {
    return swapWithNeighbour(this.edit.templates, i, by)
  }

  /** Plain copy for the repository (no reactive proxies in IndexedDB). */
  snapshot(): NoteTypeEdit {
    return $state.snapshot(this.edit)
  }
}

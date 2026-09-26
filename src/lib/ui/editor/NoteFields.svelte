<script lang="ts">
  import { tick } from 'svelte'
  import { wrapCloze } from '$lib/domain/cloze'
  import { atomicityWarnings, imageTag, insertAt } from '$lib/domain/text'
  import { t } from '$lib/i18n'
  import { mediaKind } from '$lib/media/mime'
  import { addMediaFile, detectMime } from '$lib/media/store'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import FieldInput from './FieldInput.svelte'
  import { targetField, type FieldSlot } from './slots'

  interface Props {
    /** Text fields to show, each editing `fields[slot.index]`. */
    slots: readonly FieldSlot[]
    fields: string[]
    duplicate: boolean
    clozeMissing: boolean
  }
  let { slots, fields = $bindable(), duplicate, clozeMissing }: Props = $props()
  let textareas = $state<(HTMLTextAreaElement | undefined)[]>([])
  /** Index of the last focused field (none yet: the first slot). */
  let active = $state<number>()
  /** The main text field (first slot). */
  const first = $derived(slots[0]?.index ?? 0)
  /** Where media and cloze wrapping go: always a shown field. */
  const target = $derived(targetField(slots, fields.length, active))

  type Change = (text: string, start: number, end: number) => { text: string; caret: number }

  /** Replaces the selection of field `i`, then puts the caret after the change. */
  async function change(i: number, apply: Change) {
    const el = textareas[i]
    const text = fields[i] ?? ''
    const r = apply(text, el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length)
    fields[i] = r.text
    await tick()
    el?.focus()
    el?.setSelectionRange(r.caret, r.caret)
  }

  function insert(snippet: string): Promise<void> {
    return change(target, (text, start, end) => insertAt(text, start, end, snippet))
  }

  /** Stores images and sounds, and inserts them at the caret of the last focused field. */
  export async function addFiles(files: readonly File[]) {
    for (const file of files) {
      try {
        const kind = mediaKind(detectMime(file, file.name))
        const media = await addMediaFile(file, file.name, Date.now())
        await insert(kind === 'audio' ? `[sound:${media.name}]` : imageTag(media.name))
      } catch (e) {
        toast(errorMessage(e), 'error')
      }
    }
  }

  /** Wraps the selection of the main text (the cloze text) in a new deletion; false elsewhere. */
  export function makeCloze(): boolean {
    if (target !== first) return false
    void change(first, (text, start, end) => wrapCloze(text, start, end))
    return true
  }

  /** After adding a note: back to the main text. */
  export function reset() {
    active = undefined
    void tick().then(() => textareas[first]?.focus())
  }
</script>

{#each slots as slot, j (slot.label)}
  <FieldInput
    id={`field-${slot.index}`}
    label={t(slot.label)}
    bind:value={() => fields[slot.index] ?? '', (v) => (fields[slot.index] = v)}
    bind:textarea={textareas[slot.index]}
    rows={j === 0 ? 3 : 2}
    warnings={slot.label === 'editor.extra' ? [] : atomicityWarnings(fields[slot.index] ?? '')}
    onfocus={() => (active = slot.index)}
    onfiles={addFiles}
  />
  {#if j === 0}
    {#if duplicate}<p class="warning-text" role="status">{t('editor.duplicate')}</p>{/if}
    {#if clozeMissing}
      <p class="muted small">{t('editor.clozeHelp')}</p>
    {/if}
  {/if}
{/each}

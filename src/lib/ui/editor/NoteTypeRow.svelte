<script lang="ts">
  import { MODEL_TYPES, type Deck, type ModelType, type NoteType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { href } from '$lib/router.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import { MODEL_LABEL } from '$lib/ui/model-labels'

  interface Props {
    decks: readonly Deck[]
    deckId: string
    modelType: ModelType
    noteType: NoteType | undefined
    noteTypes: readonly NoteType[]
    /** An existing note does not switch between basic, cloze, occlusion and custom types. */
    editing: boolean
    ontypechange: (next: ModelType, noteType?: NoteType) => void
  }
  let {
    decks,
    deckId = $bindable(),
    modelType,
    noteType,
    noteTypes,
    editing,
    ontypechange,
  }: Props = $props()

  const BUILT_IN = MODEL_TYPES.filter((m) => m !== 'custom').map((value) => ({
    value,
    label: MODEL_LABEL[value],
  }))
  /** Cloze, occlusion and custom fields mean something else: an existing note keeps its family. */
  const locked = (m: ModelType) => m === 'cloze' || m === 'image_occlusion' || m === 'custom'
  const value = $derived(modelType === 'custom' ? `custom:${noteType?.id ?? ''}` : modelType)

  function change(next: string) {
    const custom = noteTypes.find((nt) => `custom:${nt.id}` === next)
    if (custom) return ontypechange('custom', custom)
    const builtIn = BUILT_IN.find((x) => x.value === next)
    if (builtIn) ontypechange(builtIn.value)
  }
</script>

<div class="row">
  <div class="field grow">
    <label for="editor-deck">{t('editor.deck')}</label>
    <DeckSelect id="editor-deck" {decks} bind:value={deckId} />
  </div>
  <div class="field grow">
    <label for="editor-type">{t('editor.type')}</label>
    <select
      id="editor-type"
      {value}
      disabled={editing && locked(modelType)}
      onchange={(e) => change(e.currentTarget.value)}
    >
      {#each BUILT_IN as type (type.value)}
        <option value={type.value} disabled={editing && locked(type.value)}>
          {t(type.label)}
        </option>
      {/each}
      {#if noteTypes.length > 0}
        <optgroup label={t('editor.customTypes')}>
          {#each noteTypes as nt (nt.id)}
            <option value={`custom:${nt.id}`} disabled={editing}>{nt.name}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
    <a class="small" href={href('/note-types')}>{t('editor.manageTypes')}</a>
  </div>
</div>

<style>
  .grow {
    flex: 1;
    min-width: 12rem;
  }
</style>

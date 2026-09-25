<script lang="ts">
  import { MODEL_TYPES, type Deck, type ModelType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import { MODEL_LABEL } from '$lib/ui/model-labels'

  interface Props {
    decks: readonly Deck[]
    deckId: string
    modelType: ModelType
    /** An existing note does not switch between basic, cloze and occlusion (fields differ). */
    editing: boolean
    ontypechange: (next: ModelType) => void
  }
  let { decks, deckId = $bindable(), modelType, editing, ontypechange }: Props = $props()

  const TYPES = MODEL_TYPES.map((value) => ({ value, label: MODEL_LABEL[value] }))
  /** Cloze and occlusion fields mean something else: an existing note keeps its family. */
  const locked = (m: ModelType) => m === 'cloze' || m === 'image_occlusion'
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
      value={modelType}
      disabled={editing && locked(modelType)}
      onchange={(e) => {
        const v = TYPES.find((x) => x.value === e.currentTarget.value)
        if (v) ontypechange(v.value)
      }}
    >
      {#each TYPES as type (type.value)}
        <option value={type.value} disabled={editing && locked(type.value)}>
          {t(type.label)}
        </option>
      {/each}
    </select>
  </div>
</div>

<style>
  .grow {
    flex: 1;
    min-width: 12rem;
  }
</style>

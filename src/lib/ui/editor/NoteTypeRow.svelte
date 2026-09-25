<script lang="ts">
  import type { Deck, ModelType } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'

  interface Props {
    decks: readonly Deck[]
    deckId: string
    modelType: ModelType
    /** An existing note does not switch between cloze and basic (fields differ in meaning). */
    editing: boolean
    ontypechange: (next: ModelType) => void
  }
  let { decks, deckId = $bindable(), modelType, editing, ontypechange }: Props = $props()

  const TYPES: { value: ModelType; label: MessageKey }[] = [
    { value: 'basic', label: 'editor.basic' },
    { value: 'basic_reverse', label: 'editor.basicReverse' },
    { value: 'cloze', label: 'editor.cloze' },
  ]
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
      disabled={editing && modelType === 'cloze'}
      onchange={(e) => {
        const v = TYPES.find((x) => x.value === e.currentTarget.value)
        if (v) ontypechange(v.value)
      }}
    >
      {#each TYPES as type (type.value)}
        <option value={type.value} disabled={editing && type.value === 'cloze'}>
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

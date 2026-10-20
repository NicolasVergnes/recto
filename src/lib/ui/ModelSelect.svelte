<script lang="ts">
  import { DECK_MODELS, type DeckModel } from '$lib/domain/types'
  import { deckModelLabel } from './model-labels'

  interface Props {
    id: string
    label: string
    /** FSRS or one of the Leitner boxes (M19). */
    value: DeckModel
    /** Compartments of « Ma boîte », shown in its name. */
    customBoxes: number
    onchange?: (value: DeckModel) => void
  }
  let { id, label, value = $bindable(), customBoxes, onchange }: Props = $props()
</script>

<div class="field">
  <label for={id}>{label}</label>
  <select {id} bind:value onchange={() => onchange?.(value)}>
    {#each DECK_MODELS as model (model)}
      <option value={model}>{deckModelLabel(model, customBoxes)}</option>
    {/each}
  </select>
</div>

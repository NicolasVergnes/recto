<script lang="ts">
  import { deckOptions } from '$lib/domain/decks'
  import type { Deck } from '$lib/domain/types'

  interface Props {
    decks: readonly Deck[]
    value: string
    id?: string
    exclude?: readonly string[]
    /** Label of an empty option (e.g. "Aucun" for a top-level deck), omitted if undefined. */
    noneLabel?: string
    topLevelOnly?: boolean
    onchange?: (id: string) => void
  }
  let {
    decks,
    value = $bindable(),
    id,
    exclude = [],
    noneLabel,
    topLevelOnly = false,
    onchange,
  }: Props = $props()

  const options = $derived(
    deckOptions(decks).filter((o) => !exclude.includes(o.id) && (!topLevelOnly || o.depth === 0)),
  )
</script>

<select {id} bind:value onchange={() => onchange?.(value)}>
  {#if noneLabel !== undefined}
    <option value="">{noneLabel}</option>
  {/if}
  {#each options as option (option.id)}
    <option value={option.id}>{option.label}</option>
  {/each}
</select>

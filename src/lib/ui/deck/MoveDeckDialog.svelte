<script lang="ts">
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'

  interface Props {
    open: boolean
    decks: readonly Deck[]
    /** The deck being moved: it cannot be its own parent. */
    deckId: string
    /** A deck with sub-decks cannot become a sub-deck (one level only): the dialog says so. */
    hasSubDecks: boolean
    /** Chosen parent (empty: top level). The screen resets it each time the dialog opens. */
    target: string
    onmove: () => void
    onclose: () => void
  }
  let { open, decks, deckId, hasSubDecks, target = $bindable(), onmove, onclose }: Props = $props()
</script>

<Dialog {open} title={t('deck.moveTitle')} {onclose}>
  <div class="field">
    <label for="move-target">{t('deck.parent')}</label>
    <DeckSelect
      id="move-target"
      {decks}
      bind:value={target}
      exclude={[deckId]}
      noneLabel={t('deck.noParent')}
      topLevelOnly
    />
  </div>
  {#if hasSubDecks}<p class="muted small">{t('errors.deckNesting')}</p>{/if}
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" onclick={onmove}>{t('deck.move')}</button>
  {/snippet}
</Dialog>

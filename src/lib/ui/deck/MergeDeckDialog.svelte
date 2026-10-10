<script lang="ts">
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'

  interface Props {
    open: boolean
    decks: readonly Deck[]
    /** Decks that cannot receive the merge: the deck itself and its sub-decks. */
    exclude: readonly string[]
    /** Chosen deck (empty: none yet). The screen resets it each time the dialog opens. */
    target: string
    onmerge: () => void
    onclose: () => void
  }
  let { open, decks, exclude, target = $bindable(), onmerge, onclose }: Props = $props()
</script>

<Dialog {open} title={t('deck.mergeTitle')} {onclose}>
  <p class="muted small">{t('deck.mergeHelp')}</p>
  <div class="field">
    <label for="merge-target">{t('deck.mergeInto')}</label>
    <DeckSelect id="merge-target" {decks} bind:value={target} {exclude} noneLabel="—" />
  </div>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" disabled={!target} onclick={onmerge}>
      {t('deck.merge')}
    </button>
  {/snippet}
</Dialog>

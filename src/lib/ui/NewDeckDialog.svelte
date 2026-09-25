<script lang="ts">
  import * as repo from '$lib/db/repo'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import DeckSelect from './DeckSelect.svelte'
  import Dialog from './Dialog.svelte'
  import { errorMessage } from './errors'

  interface Props {
    open: boolean
    decks: readonly Deck[]
    parentId?: string
    oncreated: (deck: Deck) => void
  }
  let { open = $bindable(), decks, parentId = '', oncreated }: Props = $props()
  const id = $props.id()

  let name = $state('')
  let emoji = $state('')
  let parent = $state('')
  let error = $state('')
  let busy = $state(false)

  $effect(() => {
    if (open) {
      name = ''
      emoji = ''
      error = ''
      parent = parentId
    }
  })

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    try {
      const deck = await repo.createDeck(
        { name, parentId: parent || null, ...(emoji.trim() ? { emoji: emoji.trim() } : {}) },
        Date.now(),
      )
      open = false
      oncreated(deck)
    } catch (err) {
      error = errorMessage(err)
    } finally {
      busy = false
    }
  }
</script>

<Dialog {open} title={t('deck.newTitle')} onclose={() => (open = false)}>
  <form id={`${id}-form`} class="stack" onsubmit={submit}>
    <div class="field">
      <label for={`${id}-name`}>{t('deck.name')}</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id={`${id}-name`} type="text" bind:value={name} required autofocus maxlength="120" />
    </div>
    <div class="field">
      <label for={`${id}-emoji`}>{t('deck.emoji')}</label>
      <input id={`${id}-emoji`} type="text" bind:value={emoji} maxlength="8" />
    </div>
    {#if decks.length > 0}
      <div class="field">
        <label for={`${id}-parent`}>{t('deck.parent')}</label>
        <DeckSelect
          id={`${id}-parent`}
          {decks}
          bind:value={parent}
          noneLabel={t('deck.noParent')}
          topLevelOnly
        />
      </div>
    {/if}
    {#if error}<p class="error-text" role="alert">{error}</p>{/if}
  </form>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="submit" form={`${id}-form`} disabled={busy}>
      {t('deck.create')}
    </button>
  {/snippet}
</Dialog>

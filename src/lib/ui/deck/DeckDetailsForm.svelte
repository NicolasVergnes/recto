<script lang="ts">
  import * as repo from '$lib/db/repo'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '$lib/ui/errors'

  interface Props {
    deck: Deck
  }
  let { deck }: Props = $props()

  let name = $state('')
  let emoji = $state('')
  let description = $state('')
  // The form is filled once per deck: a later re-read of the same deck never overwrites edits.
  let loadedFor = ''
  $effect(() => {
    if (loadedFor !== deck.id) {
      loadedFor = deck.id
      name = deck.name
      emoji = deck.emoji ?? ''
      description = deck.description ?? ''
    }
  })

  async function save(e: SubmitEvent) {
    e.preventDefault()
    try {
      await repo.updateDeck(deck.id, { name, emoji: emoji.trim(), description }, Date.now())
      toast(t('deck.saved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }
</script>

<section class="card-surface" aria-labelledby="details-title">
  <h2 id="details-title">{t('deck.details')}</h2>
  <form class="stack" onsubmit={save}>
    <div class="field">
      <label for="deck-name">{t('deck.name')}</label>
      <input id="deck-name" type="text" bind:value={name} required maxlength="120" />
    </div>
    <div class="field">
      <label for="deck-emoji">{t('deck.emoji')}</label>
      <input id="deck-emoji" type="text" bind:value={emoji} maxlength="8" />
    </div>
    <div class="field">
      <label for="deck-description">{t('deck.description')}</label>
      <textarea id="deck-description" bind:value={description} rows="2"></textarea>
    </div>
    <div class="row">
      <button class="btn btn-primary" type="submit">{t('common.save')}</button>
    </div>
  </form>
</section>

<script lang="ts">
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { href } from '$lib/router.svelte'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    deck: Deck
    /** The parent deck of a sub-deck: shown as a link back to it. */
    parent: Deck | undefined
    cardCount: number
  }
  let { deck, parent, cardCount }: Props = $props()
</script>

<header class="stack">
  {#if parent}
    <a class="small link-target" href={`#/decks/${parent.id}`}>← {parent.name}</a>
  {/if}
  <h1 tabindex="-1">{deck.emoji ?? ''} {deck.name}</h1>
  {#if deck.description}<p class="muted">{deck.description}</p>{/if}
  <p class="muted tabular">{t('home.cardCount', { n: cardCount })}</p>
  <div class="row">
    <a class="btn btn-primary" href={href('/notes/new', { deck: deck.id })}>
      <Icon name="plus" />
      {t('deck.addNote')}
    </a>
    <a class="btn" href={href('/cards', { deck: deck.id })}>
      <Icon name="cards" />
      {t('deck.browse')}
    </a>
    <a class="btn" href={href('/review', { deck: deck.id })}>{t('deck.review')}</a>
  </div>
</header>

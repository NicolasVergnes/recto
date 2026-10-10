<script lang="ts">
  import type { DeckCount } from '$lib/db/repo'
  import { deckTree } from '$lib/domain/decks'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import type { QueueCounts } from '$lib/queue/build'
  import { href } from '$lib/router.svelte'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    decks: readonly Deck[]
    /** Today's queue per deck (sub-decks counted in their parent); undefined until it is loaded. */
    queueCounts: ReadonlyMap<string, QueueCounts> | undefined
    cardCounts: ReadonlyMap<string, DeckCount>
    onnewdeck: () => void
  }
  let { decks, queueCounts, cardCounts, onnewdeck }: Props = $props()

  const tree = $derived(deckTree(decks))
  const EMPTY: QueueCounts = { learning: 0, review: 0, new: 0 }

  function dueOf(deck: Deck): QueueCounts {
    return queueCounts?.get(deck.id) ?? EMPTY
  }

  function cardCount(deck: Deck): number {
    return cardCounts.get(deck.id)?.cards ?? 0
  }
</script>

<section class="stack" aria-labelledby="decks-title">
  <div class="row spread">
    <h2 id="decks-title">{t('home.decks')}</h2>
    <div class="row">
      <a class="btn btn-sm" href="#/notes/new">
        <Icon name="plus" />
        {t('home.addNote')}
      </a>
      <button class="btn btn-sm" type="button" onclick={onnewdeck}>
        {t('home.newDeck')}
      </button>
    </div>
  </div>
  <ul class="decks">
    {#each tree as node (node.deck.id)}
      <li>
        {@render deckRow(node.deck)}
        {#if node.children.length > 0}
          <ul class="children">
            {#each node.children as child (child.id)}
              <li>{@render deckRow(child)}</li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</section>

{#snippet deckRow(deck: Deck)}
  {@const c = dueOf(deck)}
  <div class="deck">
    <a class="name" href={`#/decks/${deck.id}`}>{deck.name}</a>
    <span class="row small tabular">
      {#if c.learning + c.review + c.new > 0}
        <span class="due" title={t('home.dueTitle')}>{c.learning + c.review}</span>
        <span class="new" title={t('home.newTitle')}>{c.new}</span>
        <a
          class="btn btn-sm"
          href={href('/review', { deck: deck.id })}
          aria-label={t('home.reviewDeckLabel', { name: deck.name })}>{t('home.reviewDeck')}</a
        >
      {:else}
        <span class="muted">{t('home.cardCount', { n: cardCount(deck) })}</span>
      {/if}
    </span>
  </div>
{/snippet}

<style>
  .decks,
  .children {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .decks {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .children {
    margin-left: var(--space-5);
    border-left: 2px solid var(--border);
  }

  .deck {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 3rem;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .children .deck {
    border: none;
    background: transparent;
  }

  .name {
    flex: 1;
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }

  .name:hover {
    text-decoration: underline;
  }

  .due,
  .new {
    min-width: 2ch;
    text-align: right;
    font-weight: 700;
  }

  .due {
    color: var(--rate-good-text);
  }

  .new {
    color: var(--rate-easy-text);
  }
</style>

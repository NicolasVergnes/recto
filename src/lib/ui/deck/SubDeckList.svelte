<script lang="ts">
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'

  interface Props {
    subDecks: readonly Deck[]
    /** Number of cards of a deck (live count of the screen). */
    countCards: (deck: Deck) => number
    onnew: () => void
  }
  let { subDecks, countCards, onnew }: Props = $props()
</script>

<section class="stack" aria-labelledby="sub-title">
  <div class="row spread">
    <h2 id="sub-title">{t('deck.subDecks')}</h2>
    <button class="btn btn-sm" type="button" onclick={onnew}>
      {t('deck.newSubDeck')}
    </button>
  </div>
  {#if subDecks.length === 0}
    <p class="muted small">{t('deck.noSubDecks')}</p>
  {:else}
    <ul class="list">
      {#each subDecks as child (child.id)}
        <li>
          <a href={`#/decks/${child.id}`}>{child.name}</a>
          <span class="muted small tabular">{t('home.cardCount', { n: countCards(child) })}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 2.75rem;
    border-bottom: 1px solid var(--border);
  }
</style>

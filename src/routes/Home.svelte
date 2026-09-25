<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { storageInfo, usageRatio } from '$lib/db/storage'
  import { QUOTA_WARNING_RATIO } from '$lib/config/app'
  import { deckTree } from '$lib/domain/decks'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import Icon from '$lib/ui/Icon.svelte'
  import NewDeckDialog from '$lib/ui/NewDeckDialog.svelte'

  let _props: RouteProps = $props()

  const decks = live(() => repo.listDecks(), [])
  const counts = live(() => repo.deckCounts(), new Map())
  const tree = $derived(deckTree(decks.value))
  let creating = $state(false)
  let quotaPct = $state<number | null>(null)

  $effect(() => {
    void storageInfo().then((info) => {
      const ratio = usageRatio(info)
      if (ratio !== null && ratio >= QUOTA_WARNING_RATIO) quotaPct = Math.round(ratio * 100)
    })
  })

  function cardCount(deck: Deck): number {
    return counts.value.get(deck.id)?.cards ?? 0
  }
</script>

<section class="page stack">
  <header>
    <h1 tabindex="-1">{t('app.name')}</h1>
    <p class="muted">{t('app.tagline')}</p>
  </header>

  {#if quotaPct !== null}
    <p class="notice notice-warning" role="alert">{t('storage.quotaWarning', { pct: quotaPct })}</p>
  {/if}

  {#if decks.loaded && decks.value.length === 0}
    <div class="card-surface stack welcome">
      <p>{t('home.methodHint')}</p>
      <div class="stack">
        <button class="btn btn-primary" type="button" onclick={() => (creating = true)}>
          <Icon name="plus" />
          {t('home.createDeck')}
        </button>
        <a class="btn" href="#/import">
          <Icon name="upload" />
          {t('home.import')}
        </a>
      </div>
    </div>
  {:else if decks.loaded}
    <section class="stack" aria-labelledby="decks-title">
      <div class="row spread">
        <h2 id="decks-title">{t('home.decks')}</h2>
        <div class="row">
          <a class="btn btn-sm" href="#/notes/new">
            <Icon name="plus" />
            {t('home.addNote')}
          </a>
          <button class="btn btn-sm" type="button" onclick={() => (creating = true)}>
            {t('home.newDeck')}
          </button>
        </div>
      </div>
      <ul class="decks">
        {#each tree as node (node.deck.id)}
          <li>
            <a class="deck" href={`#/decks/${node.deck.id}`}>
              <span class="name">{node.deck.emoji ?? ''} {node.deck.name}</span>
              <span class="muted small tabular"
                >{t('home.cardCount', { n: cardCount(node.deck) })}</span
              >
            </a>
            {#if node.children.length > 0}
              <ul class="children">
                {#each node.children as child (child.id)}
                  <li>
                    <a class="deck" href={`#/decks/${child.id}`}>
                      <span class="name">{child.emoji ?? ''} {child.name}</span>
                      <span class="muted small tabular"
                        >{t('home.cardCount', { n: cardCount(child) })}</span
                      >
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>

<NewDeckDialog
  bind:open={creating}
  decks={decks.value}
  oncreated={(deck) => navigate(`/decks/${deck.id}`)}
/>

<style>
  .welcome .btn {
    justify-content: flex-start;
  }

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
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
  }

  .children .deck {
    border: none;
    background: transparent;
  }

  .deck:hover {
    background: var(--surface-2);
  }

  .name {
    font-weight: 600;
  }
</style>

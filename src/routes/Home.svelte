<script lang="ts">
  import { QUOTA_WARNING_RATIO } from '$lib/config/app'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { storageInfo, usageRatio } from '$lib/db/storage'
  import { countsByDeck, loadTodayQueue } from '$lib/db/study'
  import { deckTree } from '$lib/domain/decks'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import type { QueueCounts } from '$lib/queue/build'
  import { href, navigate, type RouteProps } from '$lib/router.svelte'
  import Icon from '$lib/ui/Icon.svelte'
  import NewDeckDialog from '$lib/ui/NewDeckDialog.svelte'

  let _props: RouteProps = $props()

  const decks = live(() => repo.listDecks(), [])
  const counts = live(() => repo.deckCounts(), new Map())
  const today = live(async () => {
    const q = await loadTodayQueue(Date.now())
    return { total: q.result.counts, perDeck: countsByDeck(q) }
  }, null)
  const tree = $derived(deckTree(decks.value))
  const due = $derived(today.value ? today.value.total.learning + today.value.total.review : 0)
  const fresh = $derived(today.value?.total.new ?? 0)
  let creating = $state(false)
  let quotaPct = $state<number | null>(null)

  $effect(() => {
    void storageInfo().then((info) => {
      const ratio = usageRatio(info)
      if (ratio !== null && ratio >= QUOTA_WARNING_RATIO) quotaPct = Math.round(ratio * 100)
    })
  })

  const EMPTY: QueueCounts = { learning: 0, review: 0, new: 0 }

  function dueOf(deck: Deck): QueueCounts {
    return today.value?.perDeck.get(deck.id) ?? EMPTY
  }

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
    <!-- P5: the single mixed daily queue comes first; per-deck review is secondary. -->
    <section class="card-surface stack today" aria-labelledby="today-title">
      <h2 id="today-title" class="visually-hidden">{t('common.today')}</h2>
      <p class="tabular counts" aria-live="polite">
        <strong>{t('home.due', { n: due })}</strong>
        <span class="muted" aria-hidden="true">·</span>
        <span>{t('home.newCards', { n: fresh })}</span>
      </p>
      {#if due + fresh > 0}
        <a class="btn btn-primary btn-block big" href="#/review">{t('home.reviewToday')}</a>
      {:else if today.loaded}
        <p class="muted">{t('home.nothingDue')}</p>
      {/if}
    </section>

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
  {/if}
</section>

{#snippet deckRow(deck: Deck)}
  {@const c = dueOf(deck)}
  <div class="deck">
    <a class="name" href={`#/decks/${deck.id}`}>{deck.emoji ?? ''} {deck.name}</a>
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

<NewDeckDialog
  bind:open={creating}
  decks={decks.value}
  oncreated={(deck) => navigate(`/decks/${deck.id}`)}
/>

<style>
  .welcome .btn {
    justify-content: flex-start;
  }

  .today .counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: 1.15rem;
    margin: 0;
  }

  .big {
    min-height: 3.5rem;
    font-size: 1.1rem;
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

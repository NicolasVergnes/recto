<script lang="ts">
  import { cardStatus } from '$lib/domain/browse'
  import type { Card, Deck, Review } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import { formatDate, formatDateTime } from '../format'

  interface Props {
    card: Card
    deck: Deck
    reviews: readonly Review[]
    retrievability: number | null
  }
  let { card, deck, reviews, retrievability }: Props = $props()

  const pct = (x: number) => new Intl.NumberFormat('fr-FR', { style: 'percent' }).format(x)
  const num = (x: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(x)
  const RATING = $derived<Record<number, MessageKey>>(
    deck.scheduler === 'fsrs'
      ? { 1: 'review.again', 2: 'review.hard', 3: 'review.good', 4: 'review.easy' }
      : { 1: 'review.forgot', 2: 'review.ok', 3: 'review.ok', 4: 'review.sure' },
  )
</script>

<dl class="info">
  <dt>{t('info.state')}</dt>
  <dd>{t(`states.${cardStatus(card)}`)}</dd>
  <dt>{t('info.due')}</dt>
  <dd>{card.state === 0 ? '—' : formatDateTime(card.due)}</dd>
  {#if deck.scheduler === 'fsrs' && card.state !== 0}
    <dt>{t('info.retrievability')}</dt>
    <dd>
      {retrievability === null ? '—' : pct(retrievability)}
      <span class="muted small">{t('info.retrievabilityHelp')}</span>
    </dd>
    <dt>{t('info.stability')}</dt>
    <dd>
      {t('info.days', { n: num(card.stability) })}
      <span class="muted small">{t('info.stabilityHelp')}</span>
    </dd>
    <dt>{t('info.difficulty')}</dt>
    <dd>
      {num(card.difficulty)} / 10 <span class="muted small">{t('info.difficultyHelp')}</span>
    </dd>
  {/if}
  {#if deck.scheduler === 'leitner' && card.box > 0}
    <dt>{t('info.box')}</dt>
    <dd>{t('scheduler.box', { n: card.box })}</dd>
  {/if}
  <dt>{t('info.reps')}</dt>
  <dd class="tabular">{card.reps} · {t('info.lapses', { n: card.lapses })}</dd>
  <dt>{t('info.created')}</dt>
  <dd>{formatDate(card.createdAt)}</dd>
</dl>

{#if reviews.length > 0}
  <h3>{t('info.history')}</h3>
  <ol class="history small">
    {#each [...reviews].reverse() as r (r.id)}
      <li>
        <span class="tabular">{formatDateTime(r.reviewedAt)}</span>
        <span class="rating r{r.rating}">{t(RATING[r.rating] ?? 'review.good')}</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .info {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
  }

  dd .small {
    display: block;
  }

  .history {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 12rem;
    overflow-y: auto;
  }

  .history li {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding: var(--space-1) 0;
  }

  .rating {
    font-weight: 600;
  }

  .r1 {
    color: var(--danger);
  }
</style>

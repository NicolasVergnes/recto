<script lang="ts">
  import { t } from '$lib/i18n'
  import type { SessionStats } from '$lib/state/session.svelte'
  import { formatInterval } from '$lib/ui/format'

  interface Props {
    stats: SessionStats
    /** Once per day at the end of the first session (srs-rules §1, Mazza 2016). */
    sleepTip: boolean
    canUndo: boolean
    onfinish: () => void
    onundo: () => void
  }
  let { stats, sleepTip, canUndo, onfinish, onundo }: Props = $props()
</script>

<div class="page stack end">
  <h2>{t(stats.answers > 0 ? 'review.sessionDone' : 'review.nothingToDo')}</h2>
  {#if stats.answers > 0}
    <dl class="summary tabular">
      <div>
        <dt>{t('review.summarySeen')}</dt>
        <dd>{stats.answers}</dd>
      </div>
      <div>
        <dt>{t('review.summarySuccess')}</dt>
        <dd>
          {t('common.percent', {
            n: Math.round(((stats.answers - stats.again) / stats.answers) * 100),
          })}
        </dd>
      </div>
      <div>
        <dt>{t('review.summaryTime')}</dt>
        <dd>{formatInterval(Math.max(60_000, stats.totalMs))}</dd>
      </div>
    </dl>
  {:else}
    <p class="muted">{t('home.nothingDue')}</p>
  {/if}
  {#if sleepTip}<p class="notice">{t('review.sleepTip')}</p>{/if}
  <div class="row">
    <button class="btn btn-primary" type="button" onclick={onfinish}>{t('review.backHome')}</button>
    {#if canUndo}
      <button class="btn" type="button" onclick={onundo}>{t('review.undo')}</button>
    {/if}
  </div>
</div>

<style>
  .end {
    padding-top: var(--space-8);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    margin: 0;
  }

  .summary div {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: center;
  }

  .summary dt {
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .summary dd {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }
</style>

<script lang="ts">
  import { tick } from 'svelte'
  import { live } from '$lib/db/live.svelte'
  import { countDeckReviews, loadDeckReviews } from '$lib/db/optimize'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { MIN_REVIEWS, type OptimizationReport } from '$lib/scheduler/optimizer'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { OptimizerError, runOptimizer, type OptimizerFailure } from './optimizer-client'
  import OptimizerReport from './OptimizerReport.svelte'

  interface Props {
    deck: Deck
    /** Parameters in the form (null = FSRS-6 defaults). */
    params: number[] | null
    /** Saves the deck with these parameters; false when saving failed. */
    onApply: (params: number[] | null) => Promise<boolean>
  }
  let { deck, params, onApply }: Props = $props()
  const id = $props.id()

  const count = live<number | null>(() => countDeckReviews(deck.id), null)
  let busy = $state(false)
  let running = $state(false)
  let report = $state.raw<OptimizationReport | null>(null)
  let failure = $state<OptimizerFailure | null>(null)
  let status = $state<HTMLElement>()
  let result = $state<HTMLElement>()

  async function optimize() {
    busy = running = true
    report = failure = null
    try {
      const { reviews, dayStartHour } = await loadDeckReviews(deck.id)
      report = await runOptimizer({
        reviews,
        dayStartHour,
        settings: $state.snapshot(deck.settings.fsrs),
        now: Date.now(),
      })
    } catch (err) {
      if (err instanceof OptimizerError) failure = err.code
      else {
        console.error(err)
        failure = 'failed'
      }
    } finally {
      busy = running = false
    }
    await tick()
    result?.focus()
  }

  async function save(next: number[] | null) {
    busy = true
    const ok = await onApply(next)
    busy = false
    if (!ok) return
    report = null
    await tick()
    status?.focus()
  }

  async function reset() {
    const ok = await confirmAction({
      title: t('optimizer.reset'),
      message: t('optimizer.resetMessage'),
      confirmLabel: t('optimizer.reset'),
    })
    if (ok) await save(null)
  }
</script>

<div class="stack optimizer" role="group" aria-labelledby={`${id}-title`}>
  <h3 id={`${id}-title`}>{t('optimizer.title')}</h3>
  <p class="muted small">{t('optimizer.intro')}</p>
  <p bind:this={status} tabindex="-1">
    <strong>{t(params ? 'optimizer.statusCustom' : 'optimizer.statusDefault')}</strong>
  </p>
  {#if count.value !== null && count.value < MIN_REVIEWS}
    <p class="small">{t('optimizer.threshold', { n: count.value, min: MIN_REVIEWS })}</p>
  {:else if count.value !== null}
    <p class="small">{t('optimizer.reviews', { n: count.value })}</p>
    <p class="muted small">{t('optimizer.help')}</p>
    <div class="row">
      <button class="btn btn-sm" type="button" disabled={busy} onclick={optimize}>
        {t('optimizer.optimize')}
      </button>
    </div>
  {/if}
  {#if running}
    <div class="stack small" role="status">
      <progress aria-label={t('optimizer.running')}></progress>
      {t('optimizer.running')}
    </div>
  {/if}
  {#if failure || report}
    <div class="stack" bind:this={result} tabindex="-1">
      {#if failure}
        <p class="error-text" role="alert">{t(`optimizer.errors.${failure}`)}</p>
      {:else if report}
        <OptimizerReport {report} />
        {#if report.better}
          <div class="row">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              disabled={busy}
              onclick={() => report && save(report.params)}
            >
              {t('optimizer.apply')}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
  {#if params}
    <div class="row">
      <button class="btn btn-sm" type="button" disabled={busy} onclick={reset}>
        {t('optimizer.reset')}
      </button>
    </div>
  {/if}
</div>

<style>
  .optimizer {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  h3,
  p {
    margin: 0;
  }

  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

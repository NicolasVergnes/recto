<script lang="ts">
  import type { Deck, FsrsSettings } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { parseSteps, workloadFactor } from '$lib/scheduler/fsrs'
  import FsrsOptimizer from './FsrsOptimizer.svelte'

  interface Props {
    deck: Deck
    fsrs: FsrsSettings
    learningText: string
    relearningText: string
    /** Saves the deck with new FSRS parameters (optimizer); false when saving failed. */
    onApplyParams: (params: number[] | null) => Promise<boolean>
  }
  let {
    deck,
    fsrs = $bindable(),
    learningText = $bindable(),
    relearningText = $bindable(),
    onApplyParams,
  }: Props = $props()
  const id = $props.id()

  const learningOk = $derived(parseSteps(learningText) !== null)
  const relearningOk = $derived(parseSteps(relearningText) !== null)
  const workload = $derived(workloadFactor(fsrs.requestRetention, fsrs.params))
  const pct = (x: number) => Math.round(x * 100)
  const factor = (x: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(x)
</script>

<fieldset class="stack">
  <legend>{t('deckSettings.fsrsTitle')}</legend>
  <div class="field">
    <label for={`${id}-ret`}
      >{t('scheduler.retention')} : {t('common.percent', {
        n: pct(fsrs.requestRetention),
      })}</label
    >
    <input
      id={`${id}-ret`}
      type="range"
      min="0.8"
      max="0.97"
      step="0.01"
      bind:value={fsrs.requestRetention}
      aria-describedby={`${id}-ret-help`}
    />
    <p id={`${id}-ret-help`} class="muted small">{t('scheduler.retentionHelp')}</p>
    <p class="small" aria-live="polite">
      {t('deckSettings.workload', { x: factor(workload) })}
    </p>
  </div>
  <div class="grid">
    <div class="field">
      <label for={`${id}-max`}>{t('deckSettings.maxInterval')}</label>
      <input
        id={`${id}-max`}
        type="number"
        min="1"
        max="36500"
        bind:value={fsrs.maximumInterval}
        required
      />
    </div>
    <div class="field">
      <label for={`${id}-steps`}>{t('deckSettings.learningSteps')}</label>
      <input id={`${id}-steps`} type="text" bind:value={learningText} aria-invalid={!learningOk} />
    </div>
    <div class="field">
      <label for={`${id}-resteps`}>{t('deckSettings.relearningSteps')}</label>
      <input
        id={`${id}-resteps`}
        type="text"
        bind:value={relearningText}
        aria-invalid={!relearningOk}
      />
    </div>
  </div>
  {#if !learningOk || !relearningOk}
    <p class="error-text" role="alert">{t('deckSettings.stepsInvalid')}</p>
  {/if}
  <p class="muted small">{t('deckSettings.stepsHelp')}</p>
  <div class="field">
    <label for={`${id}-mode`}>{t('deckSettings.ratingMode')}</label>
    <select id={`${id}-mode`} bind:value={fsrs.ratingMode}>
      <option value={4}>{t('deckSettings.fourButtons')}</option>
      <option value={2}>{t('deckSettings.twoButtons')}</option>
    </select>
  </div>
  <FsrsOptimizer {deck} params={fsrs.params} onApply={onApplyParams} />
</fieldset>

<style>
  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3);
    margin: 0;
  }

  legend {
    font-weight: 600;
    padding: 0 var(--space-1);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-3);
  }
</style>

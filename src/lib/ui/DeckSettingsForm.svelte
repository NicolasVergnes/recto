<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { switchScheduler } from '$lib/db/study'
  import type { Deck, DeckSettings, SchedulerKind } from '$lib/domain/types'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { downloadBlob, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { parseSteps, validateFsrsSettings, workloadFactor } from '$lib/scheduler/fsrs'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from './errors'

  interface Props {
    deck: Deck
  }
  let { deck }: Props = $props()
  const id = $props.id()

  // svelte-ignore state_referenced_locally
  let settings = $state(structuredClone(deck.settings))
  // svelte-ignore state_referenced_locally
  let learningText = $state(deck.settings.fsrs.learningSteps.join(' '))
  // svelte-ignore state_referenced_locally
  let relearningText = $state(deck.settings.fsrs.relearningSteps.join(' '))
  // svelte-ignore state_referenced_locally
  let scheduler = $state<SchedulerKind>(deck.scheduler)
  let busy = $state(false)

  const learningSteps = $derived(parseSteps(learningText))
  const relearningSteps = $derived(parseSteps(relearningText))
  const workload = $derived(workloadFactor(settings.fsrs.requestRetention, settings.fsrs.params))
  const pct = (x: number) => Math.round(x * 100)
  const factor = (x: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(x)

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!learningSteps || !relearningSteps) return
    // Plain copy: $state proxies cannot be stored in IndexedDB.
    const plain = $state.snapshot(settings)
    const next: DeckSettings = {
      ...plain,
      fsrs: {
        ...plain.fsrs,
        learningSteps: [...learningSteps],
        relearningSteps: [...relearningSteps],
      },
    }
    if (validateFsrsSettings(next.fsrs).length > 0) {
      toast(t('deckSettings.invalid'), 'error')
      return
    }
    busy = true
    try {
      await repo.updateDeck(deck.id, { settings: next }, Date.now())
      endSession()
      toast(t('deckSettings.saved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }

  /** 03 §4: conversion in one transaction, preceded by an automatic backup. */
  async function changeScheduler() {
    if (scheduler === deck.scheduler) return
    const ok = await confirmAction({
      title: t('deckSettings.switchTitle'),
      message: t(scheduler === 'fsrs' ? 'deckSettings.toFsrs' : 'deckSettings.toLeitner'),
      confirmLabel: t('deckSettings.switch'),
    })
    if (!ok) {
      scheduler = deck.scheduler
      return
    }
    busy = true
    try {
      const now = Date.now()
      downloadBlob(
        await createBackup(now),
        timestampedName('recto-avant-conversion', BACKUP_EXTENSION, now),
      )
      const n = await switchScheduler(deck.id, scheduler, now)
      endSession()
      toast(t('deckSettings.switched', { n }))
    } catch (err) {
      scheduler = deck.scheduler
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<section class="card-surface stack" aria-labelledby={`${id}-title`}>
  <h2 id={`${id}-title`}>{t('deckSettings.title')}</h2>

  <fieldset class="stack">
    <legend>{t('deckSettings.scheduler')}</legend>
    <label class="check">
      <input type="radio" name={`${id}-scheduler`} value="fsrs" bind:group={scheduler} />
      {t('scheduler.fsrs')}
    </label>
    <label class="check">
      <input type="radio" name={`${id}-scheduler`} value="leitner" bind:group={scheduler} />
      {t('scheduler.leitner')}
    </label>
    {#if scheduler !== deck.scheduler}
      <div class="row">
        <button
          class="btn btn-primary btn-sm"
          type="button"
          disabled={busy}
          onclick={changeScheduler}
        >
          {t('deckSettings.switch')}
        </button>
        <span class="muted small">{t('deckSettings.switchHelp')}</span>
      </div>
    {/if}
  </fieldset>

  <form class="stack" onsubmit={save}>
    <div class="grid">
      <div class="field">
        <label for={`${id}-new`}>{t('deckSettings.newPerDay')}</label>
        <input
          id={`${id}-new`}
          type="number"
          min="0"
          max="9999"
          bind:value={settings.newPerDay}
          required
        />
      </div>
      <div class="field">
        <label for={`${id}-rev`}>{t('deckSettings.reviewsPerDay')}</label>
        <input
          id={`${id}-rev`}
          type="number"
          min="0"
          max="99999"
          bind:value={settings.reviewsPerDay}
          required
        />
      </div>
      <div class="field">
        <label for={`${id}-order`}>{t('deckSettings.newOrder')}</label>
        <select id={`${id}-order`} bind:value={settings.newOrder}>
          <option value="added">{t('deckSettings.orderAdded')}</option>
          <option value="random">{t('deckSettings.orderRandom')}</option>
        </select>
      </div>
    </div>
    <label class="check"
      ><input type="checkbox" bind:checked={settings.typedAnswer} />
      {t('deckSettings.typedAnswer')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={settings.autoplayAudio} />
      {t('deckSettings.autoplay')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={settings.burySiblings} />
      {t('deckSettings.bury')}</label
    >

    {#if deck.scheduler === 'fsrs'}
      <fieldset class="stack">
        <legend>{t('deckSettings.fsrsTitle')}</legend>
        <div class="field">
          <label for={`${id}-ret`}
            >{t('scheduler.retention')} : {t('common.percent', {
              n: pct(settings.fsrs.requestRetention),
            })}</label
          >
          <input
            id={`${id}-ret`}
            type="range"
            min="0.8"
            max="0.97"
            step="0.01"
            bind:value={settings.fsrs.requestRetention}
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
              bind:value={settings.fsrs.maximumInterval}
              required
            />
          </div>
          <div class="field">
            <label for={`${id}-steps`}>{t('deckSettings.learningSteps')}</label>
            <input
              id={`${id}-steps`}
              type="text"
              bind:value={learningText}
              aria-invalid={!learningSteps}
            />
          </div>
          <div class="field">
            <label for={`${id}-resteps`}>{t('deckSettings.relearningSteps')}</label>
            <input
              id={`${id}-resteps`}
              type="text"
              bind:value={relearningText}
              aria-invalid={!relearningSteps}
            />
          </div>
        </div>
        {#if !learningSteps || !relearningSteps}
          <p class="error-text" role="alert">{t('deckSettings.stepsInvalid')}</p>
        {/if}
        <p class="muted small">{t('deckSettings.stepsHelp')}</p>
        <div class="field">
          <label for={`${id}-mode`}>{t('deckSettings.ratingMode')}</label>
          <select id={`${id}-mode`} bind:value={settings.fsrs.ratingMode}>
            <option value={4}>{t('deckSettings.fourButtons')}</option>
            <option value={2}>{t('deckSettings.twoButtons')}</option>
          </select>
        </div>
      </fieldset>
    {:else}
      <fieldset class="stack">
        <legend>{t('deckSettings.leitnerTitle')}</legend>
        <label class="check">
          <input
            type="radio"
            name={`${id}-lmode`}
            value="interval"
            bind:group={settings.leitner.mode}
          />
          {t('scheduler.leitnerInterval')}
        </label>
        <label class="check">
          <input
            type="radio"
            name={`${id}-lmode`}
            value="calendar"
            bind:group={settings.leitner.mode}
          />
          {t('scheduler.leitnerCalendar')}
        </label>
        {#if settings.leitner.mode === 'calendar'}
          <p class="notice notice-warning small">{t('deckSettings.calendarWarning')}</p>
        {:else}
          <div class="intervals" role="group" aria-label={t('deckSettings.intervals')}>
            {#each settings.leitner.intervals as _, i (i)}
              <div class="field">
                <label for={`${id}-iv-${i}`}>{t('scheduler.box', { n: i + 1 })}</label>
                <input
                  id={`${id}-iv-${i}`}
                  type="number"
                  min="1"
                  max="36500"
                  bind:value={settings.leitner.intervals[i]}
                  required
                />
              </div>
            {/each}
          </div>
          <p class="muted small">{t('deckSettings.intervalsHelp')}</p>
        {/if}
        <label class="check">
          <input type="checkbox" bind:checked={settings.leitner.alternateSides} />
          {t('scheduler.alternateSides')}
        </label>
        <p class="muted small">{t('deckSettings.alternateHelp')}</p>
        <label class="check">
          <input type="checkbox" bind:checked={settings.leitner.allowSure} />
          {t('deckSettings.allowSure')}
        </label>
      </fieldset>
    {/if}

    <div class="row">
      <button
        class="btn btn-primary"
        type="submit"
        disabled={busy || !learningSteps || !relearningSteps}
      >
        {t('common.save')}
      </button>
    </div>
  </form>
</section>

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

  .intervals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: var(--space-2);
  }
</style>

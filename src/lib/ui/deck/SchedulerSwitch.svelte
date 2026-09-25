<script lang="ts">
  import { switchScheduler } from '$lib/db/study'
  import type { Deck, SchedulerKind } from '$lib/domain/types'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { downloadBlob, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'

  interface Props {
    deck: Deck
  }
  let { deck }: Props = $props()
  const id = $props.id()

  // svelte-ignore state_referenced_locally
  let scheduler = $state<SchedulerKind>(deck.scheduler)
  let busy = $state(false)

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
</style>

<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { restoreBackup, type RestoreMode, type RestoreReport } from '$lib/db/restore'
  import { SCHEMA_VERSION } from '$lib/db/schema'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { downloadBlob, timestampedName } from '$lib/export/download'
  import {
    BackupError,
    parseBackup,
    type BackupErrorCode,
    type ParsedBackup,
  } from '$lib/import/backup'
  import { t, type MessageKey } from '$lib/i18n'
  import { clearMediaUrls } from '$lib/media/url'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { loadPrefs } from '$lib/state/prefs.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { formatDateTime } from '../format'

  const id = $props.id()
  const ERRORS: Record<BackupErrorCode, MessageKey> = {
    notZip: 'backup.notZip',
    notBackup: 'backup.notBackup',
    newerVersion: 'backup.newerVersion',
    invalidData: 'backup.invalidData',
  }

  let parsed = $state.raw<ParsedBackup | null>(null)
  let error = $state('')
  let mode = $state<RestoreMode>('merge')
  let busy = $state(false)
  let report = $state.raw<RestoreReport | null>(null)

  async function load(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    parsed = null
    report = null
    error = ''
    if (!file) return
    try {
      parsed = parseBackup(new Uint8Array(await file.arrayBuffer()), SCHEMA_VERSION)
    } catch (err) {
      error = err instanceof BackupError ? t(ERRORS[err.code]) : errorMessage(err)
    }
  }

  async function restore() {
    if (!parsed) return
    const counts = await repo.collectionCounts()
    if (mode === 'replace') {
      const ok = await confirmAction({
        title: t('backup.replaceTitle'),
        message: t('backup.replaceConfirm', { cards: counts.cards }),
        confirmLabel: t('backup.replace'),
        danger: true,
      })
      if (!ok) return
    }
    busy = true
    try {
      // Never overwrite data without a way back (06 §2): current data is saved first.
      if (mode === 'replace' && counts.notes + counts.decks > 0) {
        const now = Date.now()
        downloadBlob(
          await createBackup(now),
          timestampedName('recto-avant-restauration', BACKUP_EXTENSION, now),
        )
      }
      report = await restoreBackup(parsed, mode)
      clearMediaUrls()
      endSession()
      await loadPrefs()
      toast(t('backup.restored'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<div class="stack">
  <div class="field">
    <label for={`${id}-file`}>{t('import.backup')}</label>
    <input id={`${id}-file`} type="file" accept=".zip,application/zip" onchange={load} />
    <p class="muted small">{t('backup.help')}</p>
  </div>
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  {#if parsed}
    <div class="notice small tabular">
      <p>
        {t('backup.from', {
          date: formatDateTime(parsed.manifest.exportedAt),
          v: parsed.manifest.appVersion || '?',
        })}
      </p>
      <p>
        {t('backup.counts', {
          decks: parsed.manifest.counts.decks,
          notes: parsed.manifest.counts.notes,
          cards: parsed.manifest.counts.cards,
          reviews: parsed.manifest.counts.reviews,
          media: parsed.manifest.counts.media,
        })}
      </p>
      {#if parsed.invalid > 0}<p class="warning-text">
          {t('backup.invalidRows', { n: parsed.invalid })}
        </p>{/if}
    </div>
    <fieldset>
      <legend>{t('backup.mode')}</legend>
      <label class="check">
        <input type="radio" name={`${id}-mode`} value="merge" bind:group={mode} />
        {t('backup.merge')}
      </label>
      <p class="muted small indent">{t('backup.mergeHelp')}</p>
      <label class="check">
        <input type="radio" name={`${id}-mode`} value="replace" bind:group={mode} />
        {t('backup.replace')}
      </label>
      <p class="muted small indent">{t('backup.replaceHelp')}</p>
    </fieldset>
    <div class="row">
      <button class="btn btn-primary" type="button" disabled={busy} onclick={restore}>
        {t('backup.restore')}
      </button>
    </div>
  {/if}

  {#if report}
    <div class="notice small tabular" role="status">
      <p>
        {t('backup.report', {
          decks: report.decks,
          notes: report.notes,
          updated: report.notesUpdated,
          cards: report.cards,
          reviews: report.reviews,
          media: report.media,
        })}
      </p>
      {#if report.missingFiles > 0}<p class="warning-text">
          {t('backup.missingFiles', { n: report.missingFiles })}
        </p>{/if}
    </div>
  {/if}
</div>

<style>
  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }

  legend {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .indent {
    margin-left: 2rem;
  }

  .notice p {
    margin: 0;
  }
</style>

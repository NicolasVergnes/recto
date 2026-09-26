<script lang="ts">
  import * as repo from '$lib/db/repo'
  import type { ApkgExportReport } from '$lib/export/apkg'
  import { csvExportable, notesToCsv, type CsvDelimiter } from '$lib/export/csv'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { slugify } from '$lib/media/mime'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import Dialog from './Dialog.svelte'
  import { exportApkg, exportErrorMessage } from './export/apkg-export-client'
  import ApkgExportSummary from './export/ApkgExportSummary.svelte'

  interface Props {
    open: boolean
    /** Export a deck with its sub-decks… */
    deckId?: string
    /** …or these notes. */
    noteIds?: readonly string[]
    name: string
  }
  let { open = $bindable(), deckId, noteIds, name }: Props = $props()
  const id = $props.id()
  const TAB: CsvDelimiter = '\t'
  let format = $state<'csv' | 'apkg'>('csv')
  let delimiter = $state<CsvDelimiter>(';')
  let busy = $state(false)
  let report = $state.raw<ApkgExportReport | null>(null)
  /** The export in progress: closing the dialog (Annuler, Escape) aborts it, nothing is saved. */
  let running: AbortController | null = null

  const scope = $derived(noteIds ? { noteIds } : deckId ? { deckId } : {})

  function close() {
    running?.abort()
    running = null
    busy = false
    open = false
    report = null
  }

  async function exportCsv(signal: AbortSignal) {
    const rows = await repo.exportRows(scope)
    signal.throwIfAborted()
    // Occlusion notes have no CSV form: say so rather than drop them silently, and never save
    // a file with nothing in it (the Anki format keeps them).
    const left = rows.filter((r) => !csvExportable(r.note)).length
    if (left > 0 && left === rows.length) {
      toast(t('exportCsv.leftOut', { n: left }), 'error')
      return
    }
    const csv = notesToCsv(rows, delimiter)
    const ext = delimiter === ';' ? 'csv' : 'tsv'
    const mime = delimiter === ';' ? 'text/csv' : 'text/tab-separated-values'
    await shareOrDownload(
      new Blob([csv], { type: `${mime};charset=utf-8` }),
      timestampedName(slugify(name), ext, Date.now()),
    )
    close()
    toast(t('exportCsv.done', { n: rows.length - left }))
    if (left > 0) toast(t('exportCsv.leftOut', { n: left }))
  }

  async function run() {
    if (busy) return
    const controller = new AbortController()
    running = controller
    busy = true
    try {
      if (format === 'csv') await exportCsv(controller.signal)
      else {
        const result = await exportApkg(scope, slugify(name), Date.now(), controller.signal)
        // The dialog stays open on the report (missing media, retired cards).
        if (!controller.signal.aborted) report = result
      }
    } catch (e) {
      if (!controller.signal.aborted) toast(exportErrorMessage(e), 'error')
    } finally {
      if (running === controller) {
        running = null
        busy = false
      }
    }
  }
</script>

<Dialog {open} title={t('exportCsv.title')} onclose={close}>
  {#if !report}
    <fieldset>
      <legend>{t('exportApkg.format')}</legend>
      <label class="check">
        <input type="radio" name={`${id}-format`} value="csv" bind:group={format} />
        {t('exportApkg.csv')}
      </label>
      <label class="check">
        <input type="radio" name={`${id}-format`} value="apkg" bind:group={format} />
        {t('exportApkg.apkg')}
      </label>
    </fieldset>
    {#if format === 'csv'}
      <p class="muted small">{t('exportCsv.help')}</p>
      <fieldset>
        <legend>{t('exportCsv.delimiter')}</legend>
        <label class="check">
          <input type="radio" name={`${id}-sep`} value=";" bind:group={delimiter} />
          {t('exportCsv.semicolon')}
        </label>
        <label class="check">
          <input type="radio" name={`${id}-sep`} value={TAB} bind:group={delimiter} />
          {t('exportCsv.tab')}
        </label>
      </fieldset>
    {:else}
      <p class="muted small">{t('exportApkg.help')}</p>
    {/if}
    {#if busy}<progress aria-label={t('exportApkg.exporting')}></progress>{/if}
  {/if}
  <ApkgExportSummary {report} {busy} />
  {#snippet actions()}
    {#if !report}
      <button class="btn" type="button" onclick={close}>{t('common.cancel')}</button>
    {/if}
    <!-- Same element before and after the export: keyboard focus stays on it. -->
    <button
      class="btn btn-primary"
      type="button"
      aria-disabled={busy}
      onclick={report ? close : run}
    >
      {t(report ? 'common.close' : busy ? 'exportApkg.exporting' : 'exportCsv.export')}
    </button>
  {/snippet}
</Dialog>

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

  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

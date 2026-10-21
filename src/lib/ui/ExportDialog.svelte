<script lang="ts">
  import { exportRpkg } from '$lib/db/export-rpkg'
  import * as repo from '$lib/db/repo'
  import { csvExportable, notesToCsv, type CsvDelimiter } from '$lib/export/csv'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { RPKG_EXTENSION } from '$lib/export/rpkg'
  import { slugify } from '$lib/media/mime'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import Dialog from './Dialog.svelte'
  import { errorMessage } from './errors'
  import RpkgFields, { rpkgDetails, type RpkgDraft } from './export/RpkgFields.svelte'

  interface Props {
    open: boolean
    /** Export a deck with its sub-decks… */
    deckId?: string
    /** …or these notes. */
    noteIds?: readonly string[]
    name: string
    /** A deck's description, offered for its package. */
    description?: string
  }
  let { open = $bindable(), deckId, noteIds, name, description }: Props = $props()
  const id = $props.id()
  const TAB: CsvDelimiter = '\t'
  let delimiter = $state<CsvDelimiter>(';')
  // M20: a deck is exported as a Recto package by default; a selection only as CSV.
  const packageable = $derived(deckId !== undefined && !noteIds)
  // svelte-ignore state_referenced_locally
  let format = $state<'rpkg' | 'csv'>(deckId !== undefined && !noteIds ? 'rpkg' : 'csv')
  // svelte-ignore state_referenced_locally
  let draft = $state<RpkgDraft>({
    title: name,
    description: description ?? '',
    author: '',
    licence: '',
  })
  let busy = $state(false)
  /** The export in progress: closing the dialog (Annuler, Escape) aborts it, nothing is saved. */
  let running: AbortController | null = null

  const scope = $derived(noteIds ? { noteIds } : deckId ? { deckId } : {})

  function close() {
    running?.abort()
    running = null
    busy = false
    open = false
  }

  async function exportCsv(signal: AbortSignal) {
    const rows = await repo.exportRows(scope)
    signal.throwIfAborted()
    // Occlusion notes have no CSV form: say so rather than drop them silently, and never save
    // a file with nothing in it (the backup keeps them).
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

  async function exportPackage(signal: AbortSignal) {
    if (!deckId) return
    const details = rpkgDetails(draft, name)
    const { blob, notes } = await exportRpkg(deckId, details, Date.now())
    signal.throwIfAborted()
    await shareOrDownload(blob, `${slugify(details.title)}.${RPKG_EXTENSION}`)
    close()
    toast(t('rpkg.exported', { n: notes }))
  }

  async function run() {
    if (busy) return
    const controller = new AbortController()
    running = controller
    busy = true
    try {
      await (format === 'rpkg' && packageable ? exportPackage : exportCsv)(controller.signal)
    } catch (e) {
      if (!controller.signal.aborted) toast(errorMessage(e), 'error')
    } finally {
      if (running === controller) {
        running = null
        busy = false
      }
    }
  }
</script>

<Dialog {open} title={t('exportCsv.title')} onclose={close}>
  {#if packageable}
    <fieldset>
      <legend>{t('rpkg.format')}</legend>
      <label class="check">
        <input type="radio" name={`${id}-format`} value="rpkg" bind:group={format} />
        {t('rpkg.formatRpkg')}
      </label>
      <label class="check">
        <input type="radio" name={`${id}-format`} value="csv" bind:group={format} />
        {t('rpkg.formatCsv')}
      </label>
    </fieldset>
  {/if}
  {#if packageable && format === 'rpkg'}
    <RpkgFields bind:draft />
  {:else}
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
  {/if}
  {#if busy}<progress aria-label={t('exportCsv.exporting')}></progress>{/if}
  {#snippet actions()}
    <button class="btn" type="button" onclick={close}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" aria-disabled={busy} onclick={run}>
      {t(busy ? 'exportCsv.exporting' : 'exportCsv.export')}
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

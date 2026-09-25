<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { notesToCsv, type CsvDelimiter } from '$lib/export/csv'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { slugify } from '$lib/media/mime'
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
  import Dialog from './Dialog.svelte'
  import { errorMessage } from './errors'

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
  let delimiter = $state<CsvDelimiter>(';')

  async function run() {
    try {
      const rows = await repo.exportRows(noteIds ? { noteIds } : deckId ? { deckId } : {})
      const csv = notesToCsv(rows, delimiter)
      const ext = delimiter === ';' ? 'csv' : 'tsv'
      const mime = delimiter === ';' ? 'text/csv' : 'text/tab-separated-values'
      await shareOrDownload(
        new Blob([csv], { type: `${mime};charset=utf-8` }),
        timestampedName(slugify(name), ext, Date.now()),
      )
      open = false
      toast(t('exportCsv.done', { n: rows.length }))
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
</script>

<Dialog {open} title={t('exportCsv.title')} onclose={() => (open = false)}>
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
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" onclick={run}>{t('exportCsv.export')}</button>
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
</style>

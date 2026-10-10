<script lang="ts">
  import { applyImportPlan, existingCollection } from '$lib/db/importer'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { newId } from '$lib/db/schema'
  import type { ModelType } from '$lib/domain/types'
  import {
    defaultMapping,
    detectModelType,
    fieldColumn,
    headerNamesFields,
    parseCsv,
    planCsvImport,
    type CsvColumn,
    type CsvData,
    type DuplicateStrategy,
  } from '$lib/import/csv'
  import type { ImportReport as Report } from '$lib/import/plan'
  import { t } from '$lib/i18n'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { csvColumns } from './csv-columns'
  import CsvMapping from './CsvMapping.svelte'
  import CsvOptions, { NEW_DECK } from './CsvOptions.svelte'
  import ImportReport from './ImportReport.svelte'
  import MissingMedia from './MissingMedia.svelte'

  const id = $props.id()

  const decks = live(() => repo.listDecks(), [])
  const noteTypes = live(() => repo.listNoteTypes(), [])

  let fileName = $state('')
  let data = $state.raw<CsvData | null>(null)
  let hasHeader = $state(false)
  let mapping = $state<CsvColumn[]>([])
  /** A built-in model type, or `custom:<note type id>` (M10). */
  let typeChoice = $state('basic')
  let deckId = $state(NEW_DECK)
  let newDeckName = $state('')
  let duplicates = $state<DuplicateStrategy>('skip')
  let busy = $state(false)
  let progress = $state<{ done: number; total: number } | null>(null)
  let report = $state.raw<Report | null>(null)
  let controller = $state.raw<AbortController | null>(null)

  const noteType = $derived(
    typeChoice.startsWith('custom:')
      ? noteTypes.value.find((n) => `custom:${n.id}` === typeChoice)
      : undefined,
  )
  const rows = $derived(data ? (hasHeader ? data.rows.slice(1) : data.rows) : [])
  const columns = $derived(csvColumns(noteType))
  const hasFront = $derived(mapping.includes(noteType ? fieldColumn(0) : 'front'))
  const missing = $derived(
    hasFront
      ? null
      : noteType
        ? t('csv.needField', { name: noteType.fields[0] ?? '' })
        : t('csv.needFront'),
  )

  async function load(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    report = null
    fileName = file.name
    const parsed = parseCsv(await file.text())
    data = parsed
    hasHeader = parsed.headerDetected
    mapping = defaultMapping(parsed, hasHeader)
    typeChoice = detectModelType(parsed, mapping, hasHeader)
    newDeckName = file.name.replace(/\.[^.]+$/, '')
    deckId = decks.value[0]?.id ?? NEW_DECK
  }

  function toggleHeader(on: boolean) {
    if (!data) return
    hasHeader = on
    mapping = defaultMapping(data, on, noteType)
  }

  /** A new type: the header guess and the column targets change with it. */
  function chooseType(choice: string) {
    typeChoice = choice
    if (!data) return
    const type = noteType
    if (type) hasHeader = data.headerDetected || headerNamesFields(data, type)
    mapping = defaultMapping(data, hasHeader, type)
  }

  async function run() {
    if (!data || !hasFront) return
    busy = true
    report = null
    controller = new AbortController()
    try {
      const now = Date.now()
      const modelType: ModelType = noteType ? 'custom' : (typeChoice as ModelType)
      const plan = planCsvImport(
        data,
        {
          mapping: [...mapping],
          hasHeader,
          modelType,
          ...(noteType ? { noteType: $state.snapshot(noteType) } : {}),
          deckId: deckId === NEW_DECK ? '' : deckId,
          newDeckName: newDeckName.trim() || fileName,
          duplicates,
        },
        await existingCollection(),
        now,
        newId,
      )
      if (plan.report.errors.some((err) => err.line === 0)) {
        report = plan.report
        return
      }
      report = await applyImportPlan(plan, {
        signal: controller.signal,
        onProgress: (done, total) => (progress = { done, total }),
      })
      endSession()
      toast(t('csv.done', { n: report.notesCreated }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
      progress = null
      controller = null
    }
  }
</script>

<div class="stack">
  <div class="field">
    <label for={`${id}-file`}>{t('import.csv')}</label>
    <input
      id={`${id}-file`}
      type="file"
      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
      onchange={load}
    />
    <p class="muted small">{t('csv.help')}</p>
  </div>

  {#if data}
    <CsvMapping
      {id}
      {rows}
      delimiter={data.delimiter}
      {hasHeader}
      ontoggle={toggleHeader}
      bind:mapping
      {columns}
      {missing}
    />
    <CsvOptions
      {id}
      {typeChoice}
      noteTypes={noteTypes.value}
      decks={decks.value}
      bind:deckId
      bind:newDeckName
      bind:duplicates
      custom={noteType}
      ontype={chooseType}
    />

    <div class="row">
      <button class="btn btn-primary" type="button" disabled={busy || !hasFront} onclick={run}>
        {t('csv.import', { n: rows.length })}
      </button>
      {#if busy && controller}
        <button class="btn" type="button" onclick={() => controller?.abort()}
          >{t('common.cancel')}</button
        >
      {/if}
    </div>
    {#if progress}
      <progress max={progress.total} value={progress.done} aria-label={t('csv.progress')}
      ></progress>
    {/if}
  {/if}

  {#if report}
    <ImportReport {report} />
    <MissingMedia names={report.missingMedia} />
  {/if}
</div>

<style>
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

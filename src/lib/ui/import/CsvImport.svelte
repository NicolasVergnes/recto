<script lang="ts">
  import { applyImportPlan, existingCollection } from '$lib/db/importer'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { newId } from '$lib/db/schema'
  import { deckOptions } from '$lib/domain/decks'
  import type { ModelType } from '$lib/domain/types'
  import {
    defaultMapping,
    detectModelType,
    parseCsv,
    planCsvImport,
    type CsvColumn,
    type CsvData,
    type DuplicateStrategy,
  } from '$lib/import/csv'
  import type { ImportReport as Report } from '$lib/import/plan'
  import { t, type MessageKey } from '$lib/i18n'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import ImportReport from './ImportReport.svelte'
  import MissingMedia from './MissingMedia.svelte'

  const id = $props.id()
  const NEW_DECK = '__new__'
  const COLUMNS: { value: CsvColumn; label: MessageKey }[] = [
    { value: 'front', label: 'csv.colFront' },
    { value: 'back', label: 'csv.colBack' },
    { value: 'extra', label: 'csv.colExtra' },
    { value: 'tags', label: 'csv.colTags' },
    { value: 'deck', label: 'csv.colDeck' },
    { value: 'type', label: 'csv.colType' },
    { value: 'ignore', label: 'csv.colIgnore' },
  ]
  const TYPES: { value: ModelType; label: MessageKey }[] = [
    { value: 'basic', label: 'editor.basic' },
    { value: 'basic_reverse', label: 'editor.basicReverse' },
    { value: 'cloze', label: 'editor.cloze' },
  ]
  const STRATEGIES: { value: DuplicateStrategy; label: MessageKey }[] = [
    { value: 'skip', label: 'csv.dupSkip' },
    { value: 'update', label: 'csv.dupUpdate' },
    { value: 'duplicate', label: 'csv.dupDuplicate' },
  ]

  const decks = live(() => repo.listDecks(), [])

  let fileName = $state('')
  let data = $state.raw<CsvData | null>(null)
  let hasHeader = $state(false)
  let mapping = $state<CsvColumn[]>([])
  let modelType = $state<ModelType>('basic')
  let deckId = $state(NEW_DECK)
  let newDeckName = $state('')
  let duplicates = $state<DuplicateStrategy>('skip')
  let busy = $state(false)
  let progress = $state<{ done: number; total: number } | null>(null)
  let report = $state.raw<Report | null>(null)
  let controller = $state.raw<AbortController | null>(null)

  const rows = $derived(data ? (hasHeader ? data.rows.slice(1) : data.rows) : [])
  const preview = $derived(rows.slice(0, 20))
  const width = $derived(mapping.length)
  const hasFront = $derived(mapping.includes('front'))

  async function load(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    report = null
    fileName = file.name
    const parsed = parseCsv(await file.text())
    data = parsed
    hasHeader = parsed.headerDetected
    mapping = defaultMapping(parsed, hasHeader)
    modelType = detectModelType(parsed, mapping, hasHeader)
    newDeckName = file.name.replace(/\.[^.]+$/, '')
    deckId = decks.value[0]?.id ?? NEW_DECK
  }

  function toggleHeader(on: boolean) {
    if (!data) return
    hasHeader = on
    mapping = defaultMapping(data, on)
  }

  async function run() {
    if (!data || !hasFront) return
    busy = true
    report = null
    controller = new AbortController()
    try {
      const now = Date.now()
      const plan = planCsvImport(
        data,
        {
          mapping: [...mapping],
          hasHeader,
          modelType,
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
    <p class="small muted">
      {t('csv.detected', {
        n: rows.length,
        sep: data.delimiter === '\t' ? t('csv.tab') : `« ${data.delimiter} »`,
      })}
    </p>
    <label class="check">
      <input
        type="checkbox"
        checked={hasHeader}
        onchange={(e) => toggleHeader(e.currentTarget.checked)}
      />
      {t('csv.header')}
    </label>

    <div class="table-wrap">
      <table>
        <caption class="visually-hidden">{t('csv.preview')}</caption>
        <thead>
          <tr>
            {#each Array.from({ length: width }, (_, i) => i) as i (i)}
              <th scope="col">
                <label class="visually-hidden" for={`${id}-col-${i}`}
                  >{t('csv.column', { n: i + 1 })}</label
                >
                <select id={`${id}-col-${i}`} bind:value={mapping[i]}>
                  {#each COLUMNS as c (c.value)}<option value={c.value}>{t(c.label)}</option>{/each}
                </select>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each preview as row, r (r)}
            <tr>
              {#each Array.from({ length: width }, (_, i) => i) as i (i)}<td>{row[i] ?? ''}</td
                >{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if !hasFront}<p class="error-text" role="alert">{t('csv.needFront')}</p>{/if}

    <div class="grid">
      <div class="field">
        <label for={`${id}-type`}>{t('editor.type')}</label>
        <select id={`${id}-type`} bind:value={modelType}>
          {#each TYPES as type (type.value)}<option value={type.value}>{t(type.label)}</option
            >{/each}
        </select>
      </div>
      <div class="field">
        <label for={`${id}-deck`}>{t('csv.target')}</label>
        <select id={`${id}-deck`} bind:value={deckId}>
          <option value={NEW_DECK}>{t('csv.newDeck')}</option>
          {#if decks.value.length > 0}
            <optgroup label={t('home.decks')}>
              {#each deckOptions(decks.value) as d (d.id)}<option value={d.id}>{d.label}</option
                >{/each}
            </optgroup>
          {/if}
        </select>
      </div>
      {#if deckId === NEW_DECK}
        <div class="field">
          <label for={`${id}-name`}>{t('deck.name')}</label>
          <input id={`${id}-name`} type="text" bind:value={newDeckName} />
        </div>
      {/if}
    </div>
    <p class="muted small">{t('csv.deckColumnHelp')}</p>

    <fieldset>
      <legend>{t('csv.duplicates')}</legend>
      {#each STRATEGIES as s (s.value)}
        <label class="check">
          <input type="radio" name={`${id}-dup`} value={s.value} bind:group={duplicates} />
          {t(s.label)}
        </label>
      {/each}
    </fieldset>

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
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-height: 22rem;
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }

  th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    min-width: 8rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-3);
  }

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

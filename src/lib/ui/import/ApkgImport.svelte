<script lang="ts">
  import { applyImportPlan, existingForApkg } from '$lib/db/importer'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { newId } from '$lib/db/schema'
  import { getSetting } from '$lib/db/settings'
  import { deckOptions } from '$lib/domain/decks'
  import type { SchedulerKind } from '$lib/domain/types'
  import {
    describePackage,
    planApkgImport,
    type ApkgPackage,
    type ApkgTarget,
  } from '$lib/import/apkg'
  import type { ImportReport as Report } from '$lib/import/plan'
  import { t, type MessageKey } from '$lib/i18n'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { formatBytes } from '../format'
  import { ApkgReadError, readApkgFile, shrinkImages } from './apkg-client'
  import ImportReport from './ImportReport.svelte'

  const id = $props.id()
  const NEW_DECK = '__new__'
  const ERRORS: Record<ApkgReadError['code'], MessageKey> = {
    anki21b: 'import.anki21b',
    notZip: 'apkg.notZip',
    noCollection: 'apkg.noCollection',
    corrupt: 'apkg.corrupt',
  }

  const decks = live(() => repo.listDecks(), [])
  let pkg = $state.raw<ApkgPackage | null>(null)
  let fileName = $state('')
  let error = $state('')
  let reading = $state<number | null>(null)
  let mode = $state<'anki' | 'single'>('anki')
  let singleDeck = $state(NEW_DECK)
  let newDeckName = $state('')
  let importHistory = $state(true)
  let scheduler = $state<SchedulerKind>('fsrs')
  let keepOriginals = $state(false)
  let busy = $state(false)
  let progress = $state<{ done: number; total: number } | null>(null)
  let report = $state.raw<Report | null>(null)
  let seconds = $state(0)

  const summary = $derived(pkg ? describePackage(pkg) : null)

  async function load(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    pkg = null
    report = null
    error = ''
    if (!file) return
    fileName = file.name
    newDeckName = file.name.replace(/\.apkg$/i, '')
    reading = 0
    try {
      pkg = await readApkgFile(file, (r) => (reading = r))
      importHistory = pkg.revlog.length > 0
    } catch (err) {
      error = err instanceof ApkgReadError ? t(ERRORS[err.code]) : errorMessage(err)
    } finally {
      reading = null
    }
  }

  async function run() {
    if (!pkg) return
    busy = true
    report = null
    const started = performance.now()
    try {
      const target: ApkgTarget =
        mode === 'anki'
          ? { mode: 'anki' }
          : singleDeck === NEW_DECK
            ? { mode: 'single', newDeckName: newDeckName.trim() || fileName }
            : { mode: 'single', deckId: singleDeck }
      const [existing, dayStartHour] = await Promise.all([
        existingForApkg(),
        getSetting('dayStartHour'),
      ])
      const plan = await planApkgImport(
        pkg,
        { target, importHistory, scheduler, dayStartHour },
        existing,
        Date.now(),
        newId,
      )
      if (!keepOriginals) await shrinkImages(plan)
      report = await applyImportPlan(plan, {
        onProgress: (done, total) => (progress = { done, total }),
      })
      seconds = Math.round((performance.now() - started) / 1000)
      endSession()
      toast(t('csv.done', { n: report.notesCreated }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
      progress = null
    }
  }
</script>

<div class="stack">
  <div class="field">
    <label for={`${id}-file`}>{t('import.apkg')}</label>
    <input id={`${id}-file`} type="file" accept=".apkg,.colpkg" onchange={load} />
    <p class="muted small">{t('apkg.help')}</p>
  </div>
  {#if reading !== null}
    <progress max="1" value={reading} aria-label={t('apkg.reading')}></progress>
  {/if}
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  {#if summary}
    <div class="notice small stack analysis">
      <p class="tabular">
        {t('apkg.summary', {
          notes: summary.notes,
          cards: summary.cards,
          media: summary.media,
          reviews: summary.reviews,
          size: formatBytes(summary.size),
        })}
      </p>
      <div>
        <p><strong>{t('home.decks')}</strong></p>
        <ul>
          {#each summary.decks as d (d.name)}
            <li>
              {d.name} <span class="muted tabular">({t('home.cardCount', { n: d.cards })})</span>
            </li>
          {/each}
        </ul>
      </div>
      <div>
        <p><strong>{t('apkg.models')}</strong></p>
        <ul>
          {#each summary.models as m (m.name)}
            <li>
              {m.name} →
              {t(
                m.modelType === 'cloze'
                  ? 'editor.cloze'
                  : m.modelType === 'basic_reverse'
                    ? 'editor.basicReverse'
                    : 'editor.basic',
              )}
              {#if m.converted}<span class="warning-text">({t('apkg.converted')})</span>{/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <fieldset class="stack">
      <legend>{t('apkg.target')}</legend>
      <label class="check">
        <input type="radio" name={`${id}-mode`} value="anki" bind:group={mode} />
        {t('apkg.keepDecks')}
      </label>
      <label class="check">
        <input type="radio" name={`${id}-mode`} value="single" bind:group={mode} />
        {t('apkg.singleDeck')}
      </label>
      {#if mode === 'single'}
        <div class="row">
          <select aria-label={t('csv.target')} bind:value={singleDeck}>
            <option value={NEW_DECK}>{t('csv.newDeck')}</option>
            {#each deckOptions(decks.value) as d (d.id)}<option value={d.id}>{d.label}</option
              >{/each}
          </select>
          {#if singleDeck === NEW_DECK}
            <input type="text" aria-label={t('deck.name')} bind:value={newDeckName} />
          {/if}
        </div>
      {/if}
    </fieldset>

    <div class="field">
      <label for={`${id}-scheduler`}>{t('apkg.scheduler')}</label>
      <select id={`${id}-scheduler`} bind:value={scheduler}>
        <option value="fsrs">{t('scheduler.fsrs')}</option>
        <option value="leitner">{t('scheduler.leitner')}</option>
      </select>
    </div>
    <label class="check">
      <input
        type="checkbox"
        bind:checked={importHistory}
        disabled={!pkg || pkg.revlog.length === 0}
      />
      {t('apkg.history')}
    </label>
    <p class="muted small">{t('apkg.historyHelp')}</p>
    <label class="check">
      <input type="checkbox" bind:checked={keepOriginals} />
      {t('apkg.keepOriginals')}
    </label>

    <div class="row">
      <button class="btn btn-primary" type="button" disabled={busy} onclick={run}>
        {t('apkg.import', { n: summary.notes })}
      </button>
    </div>
    {#if progress}
      <progress max={progress.total} value={progress.done} aria-label={t('csv.progress')}
      ></progress>
    {/if}
  {/if}

  {#if report}
    <ImportReport {report} />
    {#if report.missingMedia.length > 0}
      <p class="small warning-text">{t('apkg.missingMedia', { n: report.missingMedia.length })}</p>
    {/if}
    <p class="muted small">{t('apkg.duration', { s: seconds })}</p>
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

  .analysis p,
  .analysis ul {
    margin: 0;
  }

  .analysis ul {
    padding-left: var(--space-5);
  }

  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

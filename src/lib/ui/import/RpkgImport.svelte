<script lang="ts">
  import { applyImportPlan, existingForPackage } from '$lib/db/importer'
  import { newId, SCHEMA_VERSION } from '$lib/db/schema'
  import { newDeckModel } from '$lib/db/settings'
  import type { ModelChoice } from '$lib/domain/leitner'
  import type { ImportReport as Report } from '$lib/import/plan'
  import {
    describeRpkg,
    parseRpkg,
    planRpkgImport,
    RpkgError,
    type RpkgPackage,
    type RpkgSummary,
  } from '$lib/import/rpkg'
  import { t, type MessageKey } from '$lib/i18n'
  import { endSession } from '$lib/state/session.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'
  import { formatDate } from '../format'
  import ModelSelect from '../ModelSelect.svelte'
  import ImportReport from './ImportReport.svelte'

  const id = $props.id()
  const ERRORS: Record<RpkgError['code'], MessageKey> = {
    notZip: 'rpkg.notZip',
    notPackage: 'rpkg.notPackage',
    newerVersion: 'rpkg.newerVersion',
    invalidData: 'rpkg.invalidData',
  }

  let pkg = $state.raw<RpkgPackage | null>(null)
  let summary = $state.raw<RpkgSummary | null>(null)
  let error = $state('')
  let model = $state<ModelChoice>({ model: 'fsrs', custom: [] })
  void newDeckModel().then((m) => (model = m))
  let busy = $state(false)
  let controller = $state.raw<AbortController | null>(null)
  let progress = $state<{ done: number; total: number } | null>(null)
  let report = $state.raw<Report | null>(null)

  async function load(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0]
    pkg = null
    summary = null
    report = null
    error = ''
    if (!file) return
    try {
      pkg = parseRpkg(new Uint8Array(await file.arrayBuffer()), SCHEMA_VERSION)
      summary = describeRpkg(pkg, await existingForPackage())
    } catch (err) {
      error = err instanceof RpkgError ? t(ERRORS[err.code]) : errorMessage(err)
    }
  }

  async function run() {
    if (!pkg || busy) return
    busy = true
    controller = new AbortController()
    try {
      const plan = await planRpkgImport(
        pkg,
        { model: $state.snapshot(model) },
        await existingForPackage(),
        Date.now(),
        newId,
      )
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
    <label for={`${id}-file`}>{t('import.rpkg')}</label>
    <input id={`${id}-file`} type="file" accept=".rpkg" onchange={load} />
    <p class="muted small">{t('rpkg.importHelp')}</p>
  </div>
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  {#if pkg && summary}
    {@const m = summary.manifest}
    <div class="notice small stack">
      <p>
        <strong>{m.title || t('import.rpkg')}</strong>
        {#if m.author}<span class="muted">{t('rpkg.by', { author: m.author })}</span>{/if}
        {#if m.exportedAt > 0}
          <span class="muted">· {t('rpkg.exportedOn', { date: formatDate(m.exportedAt) })}</span>
        {/if}
      </p>
      {#if m.description}<p>{m.description}</p>{/if}
      {#if m.licence}<p class="muted">{t('rpkg.licenceIs', { licence: m.licence })}</p>{/if}
      <p class="tabular">
        {t('rpkg.summary', { notes: summary.notes, cards: m.counts.cards, media: summary.media })}
      </p>
      <ul>
        {#each summary.decks as deck (deck.path)}
          <li>
            {deck.path.replace('::', ' › ')}
            {#if deck.exists}<span class="muted">({t('rpkg.existing')})</span>{/if}
          </li>
        {/each}
      </ul>
      {#if summary.known > 0}<p>{t('rpkg.known', { n: summary.known })}</p>{/if}
      {#if pkg.invalid > 0}
        <p class="warning-text">{t('rpkg.invalidRows', { n: pkg.invalid })}</p>
      {/if}
    </div>

    <ModelSelect
      id={`${id}-scheduler`}
      label={t('apkg.scheduler')}
      bind:value={model.model}
      customBoxes={model.custom.length}
    />
    <div class="row">
      <button class="btn btn-primary" type="button" disabled={busy} onclick={run}>
        {t('apkg.import', { n: summary.notes })}
      </button>
      {#if busy && controller}
        <button class="btn" type="button" onclick={() => controller?.abort()}>
          {t('common.cancel')}
        </button>
      {/if}
    </div>
    {#if progress}
      <progress max={progress.total} value={progress.done} aria-label={t('csv.progress')}
      ></progress>
    {/if}
  {/if}

  {#if report}<ImportReport {report} />{/if}
</div>

<style>
  ul {
    margin: 0;
    padding-left: var(--space-4);
  }

  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

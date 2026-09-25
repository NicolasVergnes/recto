<script lang="ts">
  import { APP_VERSION } from '$lib/config/app'
  import * as repo from '$lib/db/repo'
  import { getSetting } from '$lib/db/settings'
  import { requestPersistence, storageInfo, usageRatio, type StorageInfo } from '$lib/db/storage'
  import type { Theme } from '$lib/db/settings'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { t, type MessageKey } from '$lib/i18n'
  import { deleteMedia, findOrphanMedia } from '$lib/media/store'
  import { clearMediaUrls } from '$lib/media/url'
  import type { RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { prefs, setDayStartHour, setFontScale, setTheme } from '$lib/state/prefs.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import { formatBytes, formatDateTime } from '$lib/ui/format'
  import { SOURCES } from '$lib/ui/sources'

  let _props: RouteProps = $props()

  const THEMES: { value: Theme; label: MessageKey }[] = [
    { value: 'system', label: 'settings.themeSystem' },
    { value: 'light', label: 'settings.themeLight' },
    { value: 'dark', label: 'settings.themeDark' },
  ]

  let info = $state<StorageInfo | null>(null)
  let lastBackupAt = $state<number | null>(null)
  let busy = $state(false)
  let wiping = $state(false)
  let backupFirst = $state(true)

  async function refresh() {
    info = await storageInfo()
    lastBackupAt = await getSetting('lastBackupAt')
  }

  $effect(() => {
    void refresh()
  })

  const ratio = $derived(info ? usageRatio(info) : null)

  async function persist() {
    const granted = await requestPersistence()
    toast(t(granted ? 'settings.persistGranted' : 'settings.persistDenied'))
    await refresh()
  }

  async function backup() {
    busy = true
    try {
      const now = Date.now()
      const blob = await createBackup(now)
      await shareOrDownload(blob, timestampedName('recto-sauvegarde', BACKUP_EXTENSION, now))
      toast(t('settings.backupDone'))
      await refresh()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  async function cleanOrphans() {
    const orphans = await findOrphanMedia()
    if (orphans.length === 0) {
      toast(t('settings.noOrphans'))
      return
    }
    const ok = await confirmAction({
      title: t('settings.orphansTitle'),
      message: t('settings.orphansConfirm', { n: orphans.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await deleteMedia(orphans)
    clearMediaUrls()
    toast(t('settings.orphansDeleted', { n: orphans.length }))
    await refresh()
  }

  /** SPEC §5.7: double confirmation, backup offered first. */
  async function wipe() {
    wiping = false
    const counts = await repo.collectionCounts()
    const ok = await confirmAction({
      title: t('settings.wipeTitle'),
      message: t('settings.wipeConfirm', { cards: counts.cards, reviews: counts.reviews }),
      confirmLabel: t('settings.wipeForSure'),
      danger: true,
    })
    if (!ok) return
    try {
      if (backupFirst) {
        const now = Date.now()
        await shareOrDownload(
          await createBackup(now),
          timestampedName('recto-avant-effacement', BACKUP_EXTENSION, now),
        )
      }
      clearMediaUrls()
      await repo.wipeAll()
      location.hash = '#/'
      location.reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
</script>

<section class="page stack settings">
  <h1 tabindex="-1">{t('settings.title')}</h1>

  <section class="card-surface stack" aria-labelledby="display-title">
    <h2 id="display-title">{t('settings.display')}</h2>
    <fieldset>
      <legend>{t('settings.theme')}</legend>
      <div class="row">
        {#each THEMES as theme (theme.value)}
          <label class="check">
            <input
              type="radio"
              name="theme"
              value={theme.value}
              checked={prefs.theme === theme.value}
              onchange={() => setTheme(theme.value)}
            />
            {t(theme.label)}
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="field">
      <label for="font-scale"
        >{t('settings.fontScale', { pct: Math.round(prefs.fontScale * 100) })}</label
      >
      <input
        id="font-scale"
        type="range"
        min="0.8"
        max="1.6"
        step="0.05"
        value={prefs.fontScale}
        onchange={(e) => setFontScale(Number(e.currentTarget.value))}
      />
    </div>
    <div class="field">
      <label for="day-start">{t('settings.dayStart')}</label>
      <select
        id="day-start"
        value={prefs.dayStartHour}
        onchange={(e) => setDayStartHour(Number(e.currentTarget.value))}
      >
        {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
          <option value={h}>{String(h).padStart(2, '0')}:00</option>
        {/each}
      </select>
      <p class="muted small">{t('settings.dayStartHelp')}</p>
    </div>
    <p class="muted small">{t('settings.language')}</p>
  </section>

  <section class="card-surface stack" aria-labelledby="backup-title">
    <h2 id="backup-title">{t('settings.backup')}</h2>
    <p class="muted small">
      {lastBackupAt
        ? t('settings.lastBackup', { date: formatDateTime(lastBackupAt) })
        : t('settings.neverBackedUp')}
    </p>
    <div class="row">
      <button class="btn btn-primary" type="button" disabled={busy} onclick={backup}>
        {t('home.backupNow')}
      </button>
      <a class="btn" href="#/import">{t('settings.restore')}</a>
    </div>
  </section>

  <section class="card-surface stack" aria-labelledby="storage-title">
    <h2 id="storage-title">{t('settings.storage')}</h2>
    {#if info}
      {#if info.usage !== null && info.quota !== null}
        <p class="tabular">
          {t('settings.usage', { used: formatBytes(info.usage), quota: formatBytes(info.quota) })}
        </p>
        <progress max="1" value={ratio ?? 0} aria-label={t('settings.storage')}></progress>
      {:else}
        <p class="muted">{t('settings.usageUnknown')}</p>
      {/if}
      <p>
        {t(
          info.persisted === true
            ? 'settings.persisted'
            : info.persisted === false
              ? 'settings.notPersisted'
              : 'settings.persistUnknown',
        )}
      </p>
      {#if info.persisted === false}
        <div class="row">
          <button class="btn" type="button" onclick={persist}>{t('storage.persistAsk')}</button>
        </div>
      {/if}
    {/if}
    <div class="row">
      <button class="btn" type="button" onclick={cleanOrphans}>{t('settings.cleanOrphans')}</button>
    </div>
  </section>

  <section class="card-surface stack danger" aria-labelledby="danger-title">
    <h2 id="danger-title">{t('settings.danger')}</h2>
    <p class="muted small">{t('settings.wipeHelp')}</p>
    <div class="row">
      <button
        class="btn btn-danger"
        type="button"
        onclick={() => ((backupFirst = true), (wiping = true))}
      >
        {t('settings.wipe')}
      </button>
    </div>
  </section>

  <section class="card-surface stack" aria-labelledby="about-title">
    <h2 id="about-title">{t('settings.about')}</h2>
    <p>{t('settings.version', { v: APP_VERSION })}</p>
    <p class="muted small">{t('settings.license')}</p>
    <p class="muted small">{t('settings.privacy')}</p>
    <details>
      <summary>{t('settings.sources')}</summary>
      <ul class="sources small">
        {#each SOURCES as source (source.label)}
          <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
        {/each}
      </ul>
    </details>
  </section>
</section>

<Dialog open={wiping} title={t('settings.wipeTitle')} onclose={() => (wiping = false)}>
  <p>{t('settings.wipeStep1')}</p>
  <label class="check">
    <input type="checkbox" bind:checked={backupFirst} />
    {t('settings.backupFirst')}
  </label>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (wiping = false)}>{t('common.cancel')}</button>
    <button class="btn btn-danger" type="button" onclick={wipe}>{t('settings.continue')}</button>
  {/snippet}
</Dialog>

<style>
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  legend {
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: var(--space-1);
  }

  progress {
    width: 100%;
    accent-color: var(--accent);
  }

  .danger {
    border-color: var(--danger);
  }

  .sources {
    padding-left: var(--space-5);
  }

  .sources li {
    margin-bottom: var(--space-1);
  }

  summary {
    cursor: pointer;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
  }
</style>

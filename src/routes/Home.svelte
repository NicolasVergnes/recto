<script lang="ts">
  import { QUOTA_WARNING_RATIO } from '$lib/config/app'
  import { getSetting } from '$lib/db/settings'
  import { BACKUP_EXTENSION, createBackup } from '$lib/export/backup'
  import { shareOrDownload, timestampedName } from '$lib/export/download'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import { importSampleDeck } from '$lib/ui/sample'
  import { familyCounts } from '$lib/domain/decks'
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { storageInfo, usageRatio } from '$lib/db/storage'
  import { countsByDeck, loadTodayQueue } from '$lib/db/study'
  import { t } from '$lib/i18n'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { backupReminderDays } from '$lib/ui/home/backup-reminder'
  import BackupFooter from '$lib/ui/home/BackupFooter.svelte'
  import BackupReminder from '$lib/ui/home/BackupReminder.svelte'
  import DeckList from '$lib/ui/home/DeckList.svelte'
  import TodaySummary from '$lib/ui/home/TodaySummary.svelte'
  import WelcomeChoices from '$lib/ui/home/WelcomeChoices.svelte'
  import NewDeckDialog from '$lib/ui/NewDeckDialog.svelte'

  let _props: RouteProps = $props()

  const decks = live(() => repo.listDecks(), [])
  const counts = live(() => repo.deckCounts(), new Map())
  const today = live(async () => {
    const q = await loadTodayQueue(Date.now())
    return { total: q.result.counts, perDeck: countsByDeck(q) }
  }, null)
  const due = $derived(today.value ? today.value.total.learning + today.value.total.review : 0)
  const fresh = $derived(today.value?.total.new ?? 0)
  let creating = $state(false)
  let quotaPct = $state<number | null>(null)
  let busy = $state(false)
  const lastBackupAt = live(() => getSetting('lastBackupAt'), null)
  const backupAgeDays = $derived(
    lastBackupAt.loaded ? backupReminderDays(lastBackupAt.value, decks.value, Date.now()) : null,
  )

  async function backup() {
    busy = true
    try {
      const now = Date.now()
      await shareOrDownload(
        await createBackup(now),
        timestampedName('recto-sauvegarde', BACKUP_EXTENSION, now),
      )
      toast(t('settings.backupDone'))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  async function trySample() {
    busy = true
    try {
      const deckId = await importSampleDeck()
      toast(t('home.sampleDone'))
      if (deckId) navigate(`/decks/${deckId}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  $effect(() => {
    void storageInfo().then((info) => {
      const ratio = usageRatio(info)
      if (ratio !== null && ratio >= QUOTA_WARNING_RATIO) quotaPct = Math.round(ratio * 100)
    })
  })
</script>

<section class="page stack">
  <header>
    <h1 tabindex="-1">{t('app.name')}</h1>
    <p class="muted">{t('app.tagline')}</p>
  </header>

  {#if quotaPct !== null}
    <p class="notice notice-warning" role="alert">{t('storage.quotaWarning', { pct: quotaPct })}</p>
  {/if}

  {#if decks.loaded && decks.value.length === 0}
    <WelcomeChoices {busy} onnewdeck={() => (creating = true)} onsample={trySample} />
  {:else if decks.loaded}
    {#if backupAgeDays !== null}
      <BackupReminder
        days={backupAgeDays}
        lastBackupAt={lastBackupAt.value}
        {busy}
        onbackup={backup}
      />
    {/if}
    <!-- P5: the single mixed daily queue comes first; per-deck review is secondary. -->
    <TodaySummary {due} {fresh} loaded={today.loaded} />
    <DeckList
      decks={decks.value}
      queueCounts={today.value?.perDeck}
      contentCounts={familyCounts(decks.value, counts.value)}
      onnewdeck={() => (creating = true)}
    />
    <BackupFooter lastBackupAt={lastBackupAt.value} {busy} onbackup={backup} />
  {/if}
</section>

<NewDeckDialog
  bind:open={creating}
  decks={decks.value}
  oncreated={(deck) => navigate(`/decks/${deck.id}`)}
/>

<script lang="ts">
  import { getSetting, setSetting } from '$lib/db/settings'
  import { storageInfo, type StorageInfo } from '$lib/db/storage'
  import { t } from '$lib/i18n'
  import type { RouteProps } from '$lib/router.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import AboutSection from '$lib/ui/settings/AboutSection.svelte'
  import BackupSection from '$lib/ui/settings/BackupSection.svelte'
  import DangerSection from '$lib/ui/settings/DangerSection.svelte'
  import DisplaySection from '$lib/ui/settings/DisplaySection.svelte'
  import NoteTypesSection from '$lib/ui/settings/NoteTypesSection.svelte'
  import SchedulingSection from '$lib/ui/settings/SchedulingSection.svelte'
  import StorageSection from '$lib/ui/settings/StorageSection.svelte'
  import WipeDialog from '$lib/ui/settings/WipeDialog.svelte'

  let _props: RouteProps = $props()

  // Loaded together by `refresh()`; the sections only show them.
  let info = $state<StorageInfo | null>(null)
  let lastBackupAt = $state<number | null>(null)
  let globalReviews = $state(500)

  // The « Tout effacer » dialog sits outside the page section, after it.
  let wiping = $state(false)
  let backupFirst = $state(true)

  async function refresh() {
    info = await storageInfo()
    lastBackupAt = await getSetting('lastBackupAt')
    globalReviews = await getSetting('globalReviewsPerDay')
  }

  async function saveGlobalReviews(n: number) {
    if (!Number.isInteger(n) || n < 0) return
    globalReviews = n
    await setSetting('globalReviewsPerDay', n)
    toast(t('settings.saved'))
  }

  function askWipe() {
    backupFirst = true
    wiping = true
  }

  $effect(() => {
    void refresh()
  })
</script>

<section class="page stack settings">
  <h1 tabindex="-1">{t('settings.title')}</h1>
  <DisplaySection {globalReviews} onsaveglobalreviews={saveGlobalReviews} />
  <SchedulingSection />
  <NoteTypesSection />
  <BackupSection {lastBackupAt} onrefresh={refresh} />
  <StorageSection {info} onrefresh={refresh} />
  <DangerSection onwipe={askWipe} />
  <AboutSection />
</section>

<WipeDialog open={wiping} bind:backupFirst onclose={() => (wiping = false)} />

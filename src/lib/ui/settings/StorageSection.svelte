<script lang="ts">
  import { requestPersistence, usageRatio, type StorageInfo } from '$lib/db/storage'
  import { t } from '$lib/i18n'
  import { deleteMedia, findOrphanMedia } from '$lib/media/store'
  import { clearMediaUrls } from '$lib/media/url'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { formatBytes } from '../format'

  interface Props {
    info: StorageInfo | null
    /** Reloads what the screen shows once the storage changed. */
    onrefresh: () => Promise<void>
  }
  let { info, onrefresh }: Props = $props()

  const ratio = $derived(info ? usageRatio(info) : null)

  async function persist() {
    const granted = await requestPersistence()
    toast(t(granted ? 'settings.persistGranted' : 'settings.persistDenied'))
    await onrefresh()
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
    await onrefresh()
  }
</script>

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

<style>
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
</style>

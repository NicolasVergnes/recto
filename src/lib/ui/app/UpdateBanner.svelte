<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    /** Applies the waiting service worker and reloads the page. */
    onreload: () => void
  }
  let { onreload }: Props = $props()
</script>

<div class="update-banner" role="status">
  <span>{t('app.updateAvailable')}</span>
  <button class="btn btn-primary btn-sm" type="button" onclick={onreload}>
    {t('app.reload')}
  </button>
</div>

<style>
  .update-banner {
    position: fixed;
    left: 50%;
    bottom: calc(4.75rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }

  @media (min-width: 900px) {
    .update-banner {
      bottom: var(--space-4);
    }
  }
</style>

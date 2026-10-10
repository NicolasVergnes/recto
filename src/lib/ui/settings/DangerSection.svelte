<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    onwipe: () => void
  }
  let { onwipe }: Props = $props()
</script>

<section class="card-surface stack danger" aria-labelledby="danger-title">
  <h2 id="danger-title">{t('settings.danger')}</h2>
  <p class="muted small">{t('settings.wipeHelp')}</p>
  <div class="row">
    <button class="btn btn-danger" type="button" onclick={onwipe}>
      {t('settings.wipe')}
    </button>
  </div>
</section>

<style>
  .danger {
    border-color: var(--danger);
  }
</style>

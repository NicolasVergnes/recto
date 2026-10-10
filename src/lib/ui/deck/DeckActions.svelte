<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    onmove: () => void
    onmerge: () => void
    onexport: () => void
    onremove: () => void
  }
  let { onmove, onmerge, onexport, onremove }: Props = $props()
</script>

<section class="stack" aria-labelledby="actions-title">
  <h2 id="actions-title">{t('deck.actions')}</h2>
  <div class="row">
    <button class="btn" type="button" onclick={onmove}>{t('deck.move')}</button>
    <button class="btn" type="button" onclick={onmerge}>{t('deck.merge')}</button>
    <button class="btn" type="button" onclick={onexport}>
      <Icon name="download" />
      {t('exportCsv.button')}
    </button>
    <button class="btn btn-danger" type="button" onclick={onremove}>
      <Icon name="trash" />
      {t('common.delete')}
    </button>
  </div>
  <p class="muted small">{t('deck.deleteHelp')}</p>
</section>

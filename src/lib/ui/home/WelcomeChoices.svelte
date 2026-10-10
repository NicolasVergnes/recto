<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    /** A sample import or a backup is running: the sample button waits for it. */
    busy: boolean
    onnewdeck: () => void
    onsample: () => void
  }
  let { busy, onnewdeck, onsample }: Props = $props()
</script>

<div class="card-surface stack welcome">
  <p>{t('home.methodHint')}</p>
  <div class="stack">
    <button class="btn btn-primary" type="button" onclick={onnewdeck}>
      <Icon name="plus" />
      {t('home.createDeck')}
    </button>
    <a class="btn" href="#/import">
      <Icon name="upload" />
      {t('home.import')}
    </a>
    <button class="btn" type="button" disabled={busy} onclick={onsample}>
      <Icon name="cards" />
      {t('home.sample')}
    </button>
  </div>
</div>

<style>
  .welcome .btn {
    justify-content: flex-start;
  }
</style>

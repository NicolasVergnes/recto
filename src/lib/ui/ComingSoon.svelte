<script lang="ts">
  import { t, type MessageKey } from '$lib/i18n'

  interface Props {
    title: MessageKey
  }
  let { title }: Props = $props()
</script>

<section class="page">
  <h1 tabindex="-1">{t(title)}</h1>
  <p class="muted">{t('common.comingSoon')}</p>
</section>

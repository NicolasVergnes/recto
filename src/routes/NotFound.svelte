<script lang="ts">
  import { t } from '$lib/i18n'
  import type { RouteProps } from '$lib/router.svelte'

  let _props: RouteProps = $props()
</script>

<section class="page">
  <h1 tabindex="-1">{t('notFound.title')}</h1>
  <p><a href="#/">{t('notFound.back')}</a></p>
</section>

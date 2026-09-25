<script lang="ts">
  import type { RouteProps } from '$lib/router.svelte'
  import ComingSoon from '$lib/ui/ComingSoon.svelte'

  let _props: RouteProps = $props()
</script>

<ComingSoon title="home.title" />

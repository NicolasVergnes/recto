<script lang="ts">
  import type { RenderedCard } from '$lib/domain/notes'
  import { t } from '$lib/i18n'
  import CardContent from '../CardContent.svelte'
  import OcclusionView from '../occlusion/OcclusionView.svelte'

  interface Props {
    rendered: RenderedCard
    side: 'front' | 'back'
  }
  let { rendered, side }: Props = $props()
</script>

<div class="side">
  <p class="visually-hidden">{t(side === 'front' ? 'browser.question' : 'browser.answer')}</p>
  {#if side === 'front'}
    {#if rendered.question}<CardContent html={rendered.question} />{/if}
    {#if rendered.occlusion}<OcclusionView occlusion={rendered.occlusion} revealed={false} />{/if}
  {:else}
    {#if rendered.occlusion}
      <OcclusionView occlusion={rendered.occlusion} revealed={true} />
      {#if rendered.answer}<CardContent html={rendered.answer} />{/if}
    {:else}
      <!-- Cloze: the whole text with the gap revealed; basic: the verso alone. -->
      <CardContent html={rendered.answer} />
    {/if}
    {#if rendered.extra}
      <div class="extra"><CardContent html={rendered.extra} /></div>
    {/if}
  {/if}
</div>

<style>
  .side {
    min-height: 0;
    max-height: 100%;
    padding: var(--space-1);
    overflow: auto;
  }

  /* Media are capped to the tile, whatever the global card rules say. */
  .side :global(.card-content img) {
    max-height: 6rem;
    margin: var(--space-1) auto;
  }

  .side :global(.occlusion img) {
    max-height: 7rem;
  }

  .extra {
    margin-top: var(--space-1);
    color: var(--text-2);
    --card-font: calc(0.9rem * var(--font-scale));
  }
</style>

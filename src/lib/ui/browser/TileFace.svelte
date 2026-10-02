<script lang="ts">
  import type { RenderedCard } from '$lib/domain/notes'
  import { t } from '$lib/i18n'
  import CardContent from '../CardContent.svelte'
  import OcclusionView from '../occlusion/OcclusionView.svelte'
  import { fitContent } from './fit'

  interface Props {
    rendered: RenderedCard
    side: 'front' | 'back'
  }
  let { rendered, side }: Props = $props()
</script>

<div class="side" {@attach fitContent}>
  <div class="fit">
    <p class="visually-hidden">{t(side === 'front' ? 'browser.question' : 'browser.answer')}</p>
    {#if side === 'front'}
      {#if rendered.question}<CardContent html={rendered.question} />{/if}
      {#if rendered.occlusion}<OcclusionView occlusion={rendered.occlusion} revealed={false} />{/if}
      {#if !rendered.question && !rendered.occlusion}<p class="muted">—</p>{/if}
    {:else}
      {#if rendered.occlusion}
        <OcclusionView occlusion={rendered.occlusion} revealed={true} />
        {#if rendered.answer}<CardContent html={rendered.answer} />{/if}
      {:else if rendered.answer}
        <!-- Cloze: the whole text with the gap revealed; basic: the verso alone. -->
        <CardContent html={rendered.answer} />
      {:else}
        <p class="muted">—</p>
      {/if}
      {#if rendered.extra}
        <div class="extra"><CardContent html={rendered.extra} /></div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Fixed height (the tile's), centred like the review card; never a scrollbar: the images
     shrink, then the content is zoomed out until it fits (fit.ts). */
  .side {
    box-sizing: border-box;
    height: 100%;
    padding: var(--space-1);
    overflow: hidden;
    container-type: size;
    text-align: center;
  }

  /* An image never exceeds the face, nor the room fit.ts leaves it beside the text. */
  .side :global(.card-content img),
  .side :global(.occlusion img) {
    max-height: var(--fit-img, 100cqh);
    margin: 0 auto;
  }

  .extra {
    margin-top: var(--space-1);
    color: var(--text-2);
    --card-font: calc(0.9rem * var(--font-scale));
  }
</style>

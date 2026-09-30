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
  /* Fixed height (the tile's); the content is zoomed out to fit it (fit.ts). */
  .side {
    box-sizing: border-box;
    height: 100%;
    padding: var(--space-1);
    overflow: auto;
    container-type: size;
  }

  /* An image never exceeds the face, so that zooming out shrinks it with the text. */
  .side :global(.card-content img),
  .side :global(.occlusion img) {
    max-height: 100cqh;
    margin: 0 auto;
  }

  .extra {
    margin-top: var(--space-1);
    color: var(--text-2);
    --card-font: calc(0.9rem * var(--font-scale));
  }
</style>

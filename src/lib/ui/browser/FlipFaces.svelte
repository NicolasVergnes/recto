<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { FlipStyle } from '$lib/db/settings'

  interface Props {
    flipped: boolean
    style: FlipStyle
    /** Back face in the DOM: lazy until the first flip (P1 spirit, half the content mounted). */
    backMounted: boolean
    front: Snippet
    back: Snippet
    onflip: () => void
  }
  let { flipped, style, backMounted, front, back, onflip }: Props = $props()

  /** Buttons and links inside a face (sound playback…) keep their own click; so does a
   * text selection ending on the face. */
  function onclick(e: MouseEvent) {
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea'))
      return
    if (getSelection()?.toString()) return
    onflip()
  }
</script>

<!-- Pointer convenience only: the accessible control is the « Retourner » button of the tile. -->
<div class="faces" class:flipped data-flip-style={style} role="presentation" {onclick}>
  <div class="inner">
    <div class="face front" inert={flipped}>{@render front()}</div>
    {#if backMounted}
      <div class="face back" inert={!flipped}>{@render back()}</div>
    {/if}
  </div>
</div>

<style>
  .faces {
    position: relative;
    flex: 1;
    min-height: 0;
    cursor: pointer;
    --flip-duration: 400ms;
  }

  .inner {
    position: absolute;
    inset: 0;
  }

  /* The content inside a face scrolls (TileFace); `overflow` on .inner or .faces would
     flatten the 3D rotation. */
  .face {
    position: absolute;
    inset: 0;
  }

  /* none: instant swap. */
  [data-flip-style='none'].flipped .front,
  [data-flip-style='none']:not(.flipped) .back {
    visibility: hidden;
  }

  /* horizontal / vertical: 3D rotation of .inner; each face hides its own back side. */
  [data-flip-style='horizontal'],
  [data-flip-style='vertical'] {
    perspective: 60rem;
  }

  [data-flip-style='horizontal'] .inner,
  [data-flip-style='vertical'] .inner {
    transform-style: preserve-3d;
    transition: transform var(--flip-duration) ease;
  }

  [data-flip-style='horizontal'].flipped .inner {
    transform: rotateY(180deg);
  }

  [data-flip-style='vertical'].flipped .inner {
    transform: rotateX(180deg);
  }

  [data-flip-style='horizontal'] .face,
  [data-flip-style='vertical'] .face {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }

  [data-flip-style='horizontal'] .back {
    transform: rotateY(180deg);
  }

  [data-flip-style='vertical'] .back {
    transform: rotateX(180deg);
  }

  /* fade: cross-fade. */
  [data-flip-style='fade'] .face {
    transition: opacity var(--flip-duration) ease;
  }

  [data-flip-style='fade'].flipped .front,
  [data-flip-style='fade']:not(.flipped) .back {
    opacity: 0;
  }

  /* slide: the front leaves to the left, the back comes from the right. */
  [data-flip-style='slide'] {
    overflow: hidden;
  }

  [data-flip-style='slide'] .face {
    transition: transform var(--flip-duration) ease;
  }

  [data-flip-style='slide'].flipped .front {
    transform: translateX(-100%);
  }

  [data-flip-style='slide']:not(.flipped) .back {
    transform: translateX(100%);
  }
</style>

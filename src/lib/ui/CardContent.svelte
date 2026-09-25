<script lang="ts">
  import { extractSounds, isRemoteUrl } from '$lib/domain/text'
  import { t } from '$lib/i18n'
  import { playSounds } from '$lib/media/audio'
  import { mediaUrl } from '$lib/media/url'
  import { sanitize } from '$lib/sanitize'
  import Icon from './Icon.svelte'

  interface Props {
    html: string
    label?: string
  }
  let { html, label }: Props = $props()

  const parts = $derived(extractSounds(html))
  const safe = $derived(sanitize(parts.html))
  let root: HTMLDivElement | undefined = $state()

  // Images are stored in IndexedDB: resolve `data-media` names to object URLs after render.
  $effect(() => {
    void safe
    const el = root
    if (!el) return
    let cancelled = false
    for (const img of el.querySelectorAll<HTMLImageElement>('img[data-media]')) {
      const name = img.dataset.media ?? ''
      if (isRemoteUrl(name)) {
        img.alt = t('media.remoteBlocked', { name })
        img.classList.add('missing')
        continue
      }
      void mediaUrl(name).then((url) => {
        if (cancelled) return
        if (url) img.src = url
        else {
          img.alt = t('media.missing', { name })
          img.classList.add('missing')
        }
      })
    }
    return () => {
      cancelled = true
    }
  })
</script>

<div class="card-content" bind:this={root} aria-label={label}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by sanitize() (dompurify whitelist) -->
  {@html safe}
</div>
{#if parts.sounds.length > 0}
  <div class="sounds">
    {#each parts.sounds as name, i (i)}
      <button class="btn btn-sm" type="button" onclick={() => playSounds([name])}>
        <Icon name="volume" />
        {t('media.play')}
        {#if parts.sounds.length > 1}{i + 1}{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .sounds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .card-content :global(img.missing) {
    display: inline-block;
    padding: var(--space-2);
    border: 1px dashed var(--border);
    color: var(--text-2);
    font-size: 0.875rem;
  }
</style>

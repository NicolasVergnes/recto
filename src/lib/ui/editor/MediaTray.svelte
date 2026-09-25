<script lang="ts">
  import { imageRefs, mediaRefs, removeImage, removeSound, setImageAlt } from '$lib/domain/text'
  import { t } from '$lib/i18n'
  import { playSounds } from '$lib/media/audio'
  import { mediaUrl } from '$lib/media/url'
  import Icon from '../Icon.svelte'

  interface Props {
    fields: string[]
  }
  let { fields = $bindable() }: Props = $props()
  const id = $props.id()

  const images = $derived(fields.flatMap((f) => imageRefs(f)))
  const sounds = $derived([...new Set(fields.flatMap((f) => mediaRefs(f).sounds))])
  let urls = $state<Record<string, string | null>>({})

  $effect(() => {
    for (const img of images) {
      if (!(img.name in urls)) void mediaUrl(img.name).then((u) => (urls[img.name] = u))
    }
  })

  function setAlt(name: string, alt: string) {
    fields = fields.map((f) => setImageAlt(f, name, alt))
  }
</script>

{#if images.length + sounds.length > 0}
  <section class="tray" aria-label={t('editor.media')}>
    {#each images as img, i (img.name)}
      <div class="item">
        {#if urls[img.name]}
          <img src={urls[img.name]} alt={img.alt} />
        {:else}
          <span class="thumb-missing">{img.name}</span>
        {/if}
        <div class="field">
          <label for={`${id}-alt-${i}`}>{t('editor.altText')}</label>
          <input
            id={`${id}-alt-${i}`}
            type="text"
            value={img.alt}
            onchange={(e) => setAlt(img.name, e.currentTarget.value)}
          />
        </div>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          onclick={() => (fields = fields.map((f) => removeImage(f, img.name)))}
        >
          <Icon name="trash" />
          {t('editor.removeImage')}
        </button>
      </div>
    {/each}
    {#each sounds as name (name)}
      <div class="item">
        <button class="btn btn-sm" type="button" onclick={() => playSounds([name])}>
          <Icon name="volume" />
          {t('media.play')}
        </button>
        <span class="small muted name">{name}</span>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          onclick={() => (fields = fields.map((f) => removeSound(f, name)))}
        >
          <Icon name="trash" />
          {t('editor.removeSound')}
        </button>
      </div>
    {/each}
  </section>
{/if}

<style>
  .tray {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .item img,
  .thumb-missing {
    width: 4rem;
    height: 4rem;
    object-fit: contain;
    background: var(--surface-2);
    border-radius: var(--radius);
    font-size: 0.7rem;
    overflow: hidden;
  }

  .item .field {
    flex: 1;
    min-width: 10rem;
  }

  .name {
    flex: 1;
    overflow-wrap: anywhere;
    align-self: center;
  }
</style>

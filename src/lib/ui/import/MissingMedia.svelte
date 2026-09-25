<script lang="ts">
  import { t } from '$lib/i18n'
  import { addNamedMedia } from '$lib/media/store'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '../errors'

  interface Props {
    names: readonly string[]
  }
  let { names }: Props = $props()
  const id = $props.id()
  let added = $state<string[]>([])
  const remaining = $derived(names.filter((n) => !added.includes(n)))

  /** 05 §1: files picked by the user are stored under the names the notes already use. */
  async function pick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : []
    e.currentTarget.value = ''
    let ignored = 0
    for (const file of files) {
      if (!remaining.includes(file.name)) {
        ignored++
        continue
      }
      try {
        await addNamedMedia(file, file.name, Date.now())
        added = [...added, file.name]
      } catch (err) {
        toast(`${file.name} : ${errorMessage(err)}`, 'error')
      }
    }
    toast(t('missingMedia.added', { n: files.length - ignored }))
  }
</script>

{#if names.length > 0}
  <div class="stack">
    <p class="small">{t('missingMedia.intro', { n: remaining.length })}</p>
    {#if remaining.length > 0}
      <details>
        <summary>{t('missingMedia.list')}</summary>
        <ul class="small names">
          {#each remaining.slice(0, 200) as name (name)}<li>{name}</li>{/each}
        </ul>
      </details>
      <div class="field">
        <label for={`${id}-files`}>{t('missingMedia.pick')}</label>
        <input id={`${id}-files`} type="file" multiple accept="image/*,audio/*" onchange={pick} />
      </div>
    {:else}
      <p class="small">{t('missingMedia.done')}</p>
    {/if}
  </div>
{/if}

<style>
  .names {
    max-height: 10rem;
    overflow-y: auto;
  }
</style>

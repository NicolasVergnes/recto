<script lang="ts">
  import { t } from '$lib/i18n'

  interface Props {
    id: string
    value: string
    known: readonly string[]
  }
  let { id, value = $bindable(), known }: Props = $props()

  const current = $derived(value.split(/\s+/).at(-1) ?? '')
  const used = $derived(new Set(value.split(/\s+/).filter(Boolean)))
  const suggestions = $derived(
    current.length === 0
      ? []
      : known
          .filter((tag) => tag.toLowerCase().startsWith(current.toLowerCase()) && !used.has(tag))
          .slice(0, 6),
  )

  function complete(tag: string) {
    const parts = value.split(/\s+/)
    parts[parts.length - 1] = tag
    value = `${parts.join(' ')} `
  }
</script>

<div class="field">
  <label for={id}>{t('editor.tags')}</label>
  <input {id} type="text" bind:value autocomplete="off" aria-describedby={`${id}-help`} />
  <p id={`${id}-help`} class="muted small">{t('editor.tagsHelp')}</p>
  {#if suggestions.length > 0}
    <div class="row" role="group" aria-label={t('editor.tagSuggestions')}>
      {#each suggestions as tag (tag)}
        <button class="btn btn-sm" type="button" onclick={() => complete(tag)}>{tag}</button>
      {/each}
    </div>
  {/if}
</div>

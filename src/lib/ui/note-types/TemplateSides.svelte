<script lang="ts">
  import type { EditedTemplate } from '$lib/domain/note-types'
  import { kindOf } from '$lib/domain/templates'
  import { t } from '$lib/i18n'

  interface Props {
    /** Edited in place (an entry of the draft). */
    template: EditedTemplate
    /** Field names of the type, for the source of a cloze or occlusion card. */
    fields: readonly string[]
    id: string
  }
  let { template, fields, id }: Props = $props()
  const kind = $derived(kindOf(template))
</script>

{#if kind === 'classic'}
  <div class="field">
    <label for="{id}-front">{t('noteTypes.question')}</label>
    <textarea id="{id}-front" class="code" rows="3" bind:value={template.front}></textarea>
  </div>
  <div class="field">
    <label for="{id}-back">{t('noteTypes.answer')}</label>
    <textarea id="{id}-back" class="code" rows="3" bind:value={template.back}></textarea>
  </div>
{:else}
  <div class="field">
    <label for="{id}-field">
      {t(kind === 'cloze' ? 'noteTypes.clozeField' : 'noteTypes.imageField')}
    </label>
    <select id="{id}-field" bind:value={template.field}>
      {#each fields as name (name)}
        <option value={name}>{name}</option>
      {/each}
    </select>
  </div>
  {#if kind === 'occlusion'}
    <div class="field">
      <label for="{id}-front">{t('noteTypes.header')}</label>
      <textarea id="{id}-front" class="code" rows="2" bind:value={template.front}></textarea>
    </div>
  {/if}
  <div class="field">
    <label for="{id}-back">{t('noteTypes.added')}</label>
    <textarea id="{id}-back" class="code" rows="2" bind:value={template.back}></textarea>
  </div>
  <label class="check">
    <input type="checkbox" bind:checked={template.single} />
    {t('noteTypes.single')}
  </label>
{/if}

<style>
  .code {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
</style>

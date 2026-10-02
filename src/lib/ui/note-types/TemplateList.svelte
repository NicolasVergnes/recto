<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'
  import type { NoteTypeDraft } from './draft.svelte'

  interface Props {
    draft: NoteTypeDraft
  }
  let { draft }: Props = $props()
  const uid = $props.id()
</script>

<section class="stack" aria-labelledby="{uid}-title">
  <h2 id="{uid}-title">{t('noteTypes.cards')}</h2>
  <p class="muted small">{t('noteTypes.cardsHelp')}</p>
  {#each draft.edit.templates as template, i (i)}
    <fieldset class="card-surface stack template">
      <legend class="visually-hidden">{template.name}</legend>
      <div class="row spread">
        <div class="field grow">
          <label for="{uid}-{i}-name">{t('noteTypes.cardName')}</label>
          <input id="{uid}-{i}-name" type="text" maxlength="60" bind:value={template.name} />
        </div>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          disabled={draft.edit.templates.length === 1}
          onclick={() => draft.removeTemplate(i)}
        >
          <Icon name="trash" />
          <span class="visually-hidden">{t('noteTypes.removeCard', { name: template.name })}</span>
        </button>
      </div>
      <div class="field">
        <label for="{uid}-{i}-front">{t('noteTypes.question')}</label>
        <textarea id="{uid}-{i}-front" class="code" rows="3" bind:value={template.front}></textarea>
      </div>
      <div class="field">
        <label for="{uid}-{i}-back">{t('noteTypes.answer')}</label>
        <textarea id="{uid}-{i}-back" class="code" rows="3" bind:value={template.back}></textarea>
      </div>
    </fieldset>
  {/each}
  <div>
    <button class="btn btn-sm" type="button" onclick={() => draft.addTemplate()}>
      <Icon name="plus" />
      {t('noteTypes.addCard')}
    </button>
  </div>
  <p class="muted small">{t('noteTypes.syntax')}</p>
</section>

<style>
  .template {
    border: 1px solid var(--border);
  }

  .grow {
    flex: 1;
  }

  .code {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
</style>

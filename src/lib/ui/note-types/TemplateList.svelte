<script lang="ts">
  import { t } from '$lib/i18n'
  import Icon from '../Icon.svelte'
  import type { NoteTypeDraft } from './draft.svelte'
  import MoveButtons, { focusMoved } from './MoveButtons.svelte'

  interface Props {
    draft: NoteTypeDraft
  }
  let { draft }: Props = $props()
  const uid = $props.id()
  /** Spoken after a move; the live region stays in the page (inserted ones are often skipped). */
  let announcement = $state('')

  function move(i: number, by: -1 | 1) {
    const to = draft.moveTemplate(i, by)
    if (to === i) return
    announcement = t('noteTypes.cardMoved', {
      name: draft.edit.templates[to]?.name ?? '',
      n: to + 1,
      total: draft.edit.templates.length,
    })
    void focusMoved(`${uid}-${to}`, by)
  }
</script>

<section class="stack" aria-labelledby="{uid}-title">
  <h2 id="{uid}-title">{t('noteTypes.cards')}</h2>
  <p class="muted small">{t('noteTypes.cardsHelp')}</p>
  {#each draft.edit.templates as template, i (i)}
    <fieldset class="card-surface stack template">
      <legend class="visually-hidden">{template.name}</legend>
      <div class="row spread head">
        <div class="field grow">
          <label for="{uid}-{i}-name">{t('noteTypes.cardName')}</label>
          <input id="{uid}-{i}-name" type="text" maxlength="60" bind:value={template.name} />
        </div>
        <div class="row tools">
          <MoveButtons
            id="{uid}-{i}"
            upLabel={t('noteTypes.moveCardUp', { name: template.name })}
            downLabel={t('noteTypes.moveCardDown', { name: template.name })}
            first={i === 0}
            last={i === draft.edit.templates.length - 1}
            onmove={(by) => move(i, by)}
          />
          <button
            class="btn btn-sm btn-ghost"
            type="button"
            disabled={draft.edit.templates.length === 1}
            onclick={() => draft.removeTemplate(i)}
          >
            <Icon name="trash" />
            <span class="visually-hidden">{t('noteTypes.removeCard', { name: template.name })}</span
            >
          </button>
        </div>
      </div>
      <div class="field">
        <label class="check">
          <input
            type="checkbox"
            checked={!!template.twoWay}
            aria-describedby="{uid}-{i}-two-way-help"
            onchange={(e) => draft.setTwoWay(i, e.currentTarget.checked)}
          />
          {t('noteTypes.twoWay')}
        </label>
        <p id="{uid}-{i}-two-way-help" class="muted small">{t('noteTypes.twoWayHelp')}</p>
      </div>
      <div class="field">
        <label for="{uid}-{i}-front"
          >{t(template.twoWay ? 'noteTypes.face1' : 'noteTypes.question')}</label
        >
        <textarea id="{uid}-{i}-front" class="code" rows="3" bind:value={template.front}></textarea>
      </div>
      <div class="field">
        <label for="{uid}-{i}-back"
          >{t(template.twoWay ? 'noteTypes.face2' : 'noteTypes.answer')}</label
        >
        <textarea id="{uid}-{i}-back" class="code" rows="3" bind:value={template.back}></textarea>
      </div>
    </fieldset>
  {/each}
  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
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

  /* The buttons line up with the name field, not with its label. */
  .head {
    align-items: flex-end;
  }

  .tools {
    flex-wrap: nowrap;
  }

  .code {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
</style>

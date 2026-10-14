<script lang="ts">
  import { kindOf } from '$lib/domain/templates'
  import { CARD_KINDS, type CardKind } from '$lib/domain/types'
  import { t, type MessageKey } from '$lib/i18n'
  import Icon from '../Icon.svelte'
  import type { NoteTypeDraft } from './draft.svelte'
  import MoveButtons, { focusMoved } from './MoveButtons.svelte'
  import TemplateSides from './TemplateSides.svelte'

  interface Props {
    draft: NoteTypeDraft
  }
  let { draft }: Props = $props()
  const uid = $props.id()
  /** Spoken after a move; the live region stays in the page (inserted ones are often skipped). */
  let announcement = $state('')

  const KIND_LABEL: Record<CardKind, MessageKey> = {
    classic: 'editor.classic',
    cloze: 'editor.cloze',
    occlusion: 'editor.imageOcclusion',
  }

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
        <label for="{uid}-{i}-kind">{t('noteTypes.kind')}</label>
        <select
          id="{uid}-{i}-kind"
          value={kindOf(template)}
          onchange={(e) => {
            const kind = CARD_KINDS.find((k) => k === e.currentTarget.value)
            if (kind) draft.setKind(i, kind)
          }}
        >
          {#each CARD_KINDS as kind (kind)}
            <option value={kind}>{t(KIND_LABEL[kind])}</option>
          {/each}
        </select>
      </div>
      <TemplateSides
        {template}
        fields={draft.shape.fields}
        id="{uid}-{i}"
        ontwoway={(twoWay) => draft.setTwoWay(i, twoWay)}
      />
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
</style>

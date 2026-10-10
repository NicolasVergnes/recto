<script lang="ts">
  import { t } from '$lib/i18n'
  import { toast } from '$lib/state/toast.svelte'
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
    const to = draft.moveField(i, by)
    if (to === i) return
    announcement = t('noteTypes.fieldMoved', {
      name: draft.edit.fields[to]?.name ?? '',
      n: to + 1,
      total: draft.edit.fields.length,
    })
    void focusMoved(`${uid}-${to}`, by)
  }

  /** A field used by a card stays: the reason is given (the button keeps its focus). */
  function remove(i: number) {
    const name = draft.edit.fields[i]?.name.trim() ?? ''
    const users = draft.removeField(i)
    if (users.length === 0) return
    const cards = users.map((u) => `« ${u} »`).join(', ')
    toast(t('noteTypes.fieldInUse', { name, cards, n: users.length }), 'error')
  }
</script>

<section class="stack" aria-labelledby="{uid}-title">
  <h2 id="{uid}-title">{t('noteTypes.fields')}</h2>
  <ol class="fields">
    {#each draft.edit.fields as field, i (i)}
      <li class="row">
        <label class="visually-hidden" for="{uid}-{i}"
          >{t('noteTypes.fieldName', { n: i + 1 })}</label
        >
        <!-- Renamed on change, not on each key: the templates follow the committed name. -->
        <input
          id="{uid}-{i}"
          type="text"
          value={field.name}
          maxlength="60"
          onchange={(e) => draft.renameField(i, e.currentTarget.value)}
        />
        <MoveButtons
          id="{uid}-{i}"
          upLabel={t('noteTypes.moveFieldUp', { name: field.name })}
          downLabel={t('noteTypes.moveFieldDown', { name: field.name })}
          first={i === 0}
          last={i === draft.edit.fields.length - 1}
          onmove={(by) => move(i, by)}
        />
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          disabled={draft.edit.fields.length === 1}
          onclick={() => remove(i)}
        >
          <Icon name="trash" />
          <span class="visually-hidden">{t('noteTypes.removeField', { name: field.name })}</span>
        </button>
      </li>
    {/each}
  </ol>
  <p class="visually-hidden" role="status" aria-live="polite">{announcement}</p>
  <div>
    <button class="btn btn-sm" type="button" onclick={() => draft.addField()}>
      <Icon name="plus" />
      {t('noteTypes.addField')}
    </button>
  </div>
</section>

<style>
  .fields {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding-left: var(--space-5);
  }

  .fields .row {
    flex-wrap: nowrap;
  }

  .fields input {
    flex: 1;
  }
</style>

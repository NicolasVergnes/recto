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
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          disabled={draft.edit.fields.length === 1}
          onclick={() => draft.removeField(i)}
        >
          <Icon name="trash" />
          <span class="visually-hidden">{t('noteTypes.removeField', { name: field.name })}</span>
        </button>
      </li>
    {/each}
  </ol>
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

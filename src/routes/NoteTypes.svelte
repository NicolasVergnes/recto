<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import { DEFAULT_NOTE_TYPE } from '$lib/domain/note-types'
  import type { NoteType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { href, navigate, type RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import Icon from '$lib/ui/Icon.svelte'

  let _props: RouteProps = $props()

  const types = live(() => repo.listNoteTypes(), [])
  const usage = live(() => repo.noteTypeUsage(), new Map<string, number>())

  /** A new type named apart from the others, then its editor. */
  async function create() {
    const names = new Set(types.value.map((nt) => nt.name.toLowerCase()))
    let name = t('noteTypes.newName')
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${t('noteTypes.newName')} ${i}`
    try {
      const type = await repo.createNoteType({ name, ...DEFAULT_NOTE_TYPE }, Date.now())
      navigate(`/note-types/${type.id}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  /** A type in use is not deleted: the message says why (its notes would lose their cards). */
  async function remove(type: NoteType, notes: number) {
    if (notes > 0) {
      toast(t('errors.noteTypeInUse'), 'error')
      return
    }
    const ok = await confirmAction({
      title: t('noteTypes.deleteTitle'),
      message: t('noteTypes.deleteConfirm', { name: type.name }),
      confirmLabel: t('noteTypes.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await repo.deleteNoteType(type.id)
      toast(t('noteTypes.deleted'))
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
</script>

<section class="page stack">
  <div class="row spread">
    <h1 tabindex="-1">{t('noteTypes.title')}</h1>
    <button class="btn" type="button" onclick={create}>
      <Icon name="plus" />
      {t('noteTypes.new')}
    </button>
  </div>
  <p class="muted">{t('noteTypes.help')}</p>

  {#if types.loaded && types.value.length === 0}
    <p class="notice">{t('noteTypes.empty')}</p>
  {:else}
    <ul class="types stack">
      {#each types.value as type (type.id)}
        {@const notes = usage.value.get(type.id) ?? 0}
        <li class="card-surface row spread">
          <div>
            <a class="name" href={href(`/note-types/${type.id}`)}>{type.name}</a>
            <p class="muted small tabular">
              {t('noteTypes.fieldsCount', { n: type.fields.length })} ·
              {t('noteTypes.cardsCount', { n: type.templates.length })} ·
              {t('noteTypes.notesCount', { n: notes })}
            </p>
          </div>
          <div class="row">
            <a class="btn btn-sm" href={href(`/note-types/${type.id}`)}>
              <Icon name="edit" />
              {t('noteTypes.edit')}
            </a>
            <button class="btn btn-sm btn-ghost" type="button" onclick={() => remove(type, notes)}>
              <Icon name="trash" />
              {t('noteTypes.delete')}
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .types {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .types li {
    padding: var(--space-3) var(--space-4);
  }

  .types p {
    margin: 0;
  }

  .name {
    font-weight: 600;
  }
</style>

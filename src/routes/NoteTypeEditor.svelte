<script lang="ts">
  import * as repo from '$lib/db/repo'
  import { unknownReference, validateNoteType } from '$lib/domain/note-types'
  import type { Note, NoteType } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { href, navigate, type RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import CardPreview from '$lib/ui/editor/CardPreview.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import { NoteTypeDraft } from '$lib/ui/note-types/draft.svelte'
  import FieldList from '$lib/ui/note-types/FieldList.svelte'
  import TemplateList from '$lib/ui/note-types/TemplateList.svelte'

  let { params }: RouteProps = $props()

  const draft = new NoteTypeDraft()
  let type = $state.raw<NoteType>()
  let sample = $state.raw<Note>()
  let busy = $state(false)

  $effect(() => {
    const id = params.id ?? ''
    void (async () => {
      const found = await repo.getNoteType(id)
      if (!found) {
        toast(t('noteTypes.notFound'), 'error')
        navigate('/note-types')
        return
      }
      type = found
      sample = await repo.firstNoteOfType(id)
      draft.load(found)
    })()
  })

  /** The first note's values (fields follow their renames), else the field names themselves. */
  const sampleFields = $derived(
    draft.edit.fields.map((f) =>
      sample && f.from !== null ? (sample.fields[f.from] ?? '') : `[${f.name}]`,
    ),
  )
  /** Its masks follow their image field the same way (M14). */
  const sampleMasks = $derived(
    draft.edit.fields.map((f) => (f.from !== null ? (sample?.masks?.[f.from] ?? '') : '')),
  )

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!type || busy) return
    const edit = draft.snapshot()
    const invalid = validateNoteType({ name: edit.name, ...draft.shape })
    if (invalid) {
      const unknown = invalid === 'noteTypeUnknownField' ? unknownReference(draft.shape) : null
      toast(unknown ? t('noteTypes.unknownField', unknown) : t(`errors.${invalid}`), 'error')
      return
    }
    busy = true
    try {
      const { added, removed, lost } = await repo.previewNoteTypeEdit(type.id, edit)
      if (added + removed + lost.length > 0) {
        const ok = await confirmAction({
          title: t('noteTypes.confirmTitle'),
          message: [
            ...(added + removed > 0 ? [t('noteTypes.confirm', { added, removed })] : []),
            ...lost.map((l) => t('noteTypes.fieldLost', { name: l.field, n: l.notes })),
          ].join(' '),
          confirmLabel: t('noteTypes.save'),
          danger: removed + lost.length > 0,
        })
        if (!ok) return
      }
      const plan = await repo.updateNoteType(type.id, edit, Date.now())
      type = plan.type
      draft.load(plan.type)
      sample = await repo.firstNoteOfType(plan.type.id)
      toast(t('noteTypes.saved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      busy = false
    }
  }
</script>

<section class="page page-wide stack">
  <a class="small" href={href('/note-types')}>← {t('noteTypes.back')}</a>
  <h1 tabindex="-1">{t('noteTypes.editTitle')}</h1>

  {#if type}
    <div class="layout">
      <form class="stack" onsubmit={save}>
        <div class="field">
          <label for="note-type-name">{t('noteTypes.name')}</label>
          <input id="note-type-name" type="text" maxlength="120" bind:value={draft.edit.name} />
        </div>
        <FieldList {draft} />
        <TemplateList {draft} />
        <div>
          <button class="btn btn-primary" type="submit" disabled={busy}>
            {t('noteTypes.save')}
          </button>
        </div>
      </form>

      <div class="stack">
        <p class="muted small">{t(sample ? 'noteTypes.preview' : 'noteTypes.previewSample')}</p>
        <CardPreview
          note={{ modelType: 'custom', fields: sampleFields, masks: sampleMasks }}
          noteType={draft.shape}
        />
      </div>
    </div>
  {/if}
</section>

<style>
  .layout {
    display: grid;
    gap: var(--space-6);
  }

  @media (min-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
    }
  }
</style>

<script lang="ts">
  import type { SvelteSet } from 'svelte/reactivity'
  import * as repo from '$lib/db/repo'
  import type { BrowserRow } from '$lib/domain/browse'
  import { parseTags } from '$lib/domain/text'
  import type { Deck } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import ExportDialog from '$lib/ui/ExportDialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import Icon from '$lib/ui/Icon.svelte'

  interface Props {
    selected: SvelteSet<string>
    selectedRows: readonly BrowserRow[]
    selectedNoteIds: readonly string[]
    decks: readonly Deck[]
  }
  let { selected, selectedRows, selectedNoteIds, decks }: Props = $props()

  let exporting = $state(false)
  let moving = $state(false)
  let moveTarget = $state('')
  let tagging = $state(false)
  let tagText = $state('')

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast(done)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function suspend(on: boolean) {
    await run(
      () => repo.setSuspended([...selected], on),
      t(on ? 'browser.suspended' : 'browser.unsuspended'),
    )
  }

  async function reset() {
    const n = selected.size
    const first = await confirmAction({
      title: t('browser.resetTitle'),
      message: t('browser.resetConfirm', { n }),
      confirmLabel: t('browser.reset'),
      danger: true,
    })
    if (!first) return
    const second = await confirmAction({
      title: t('browser.resetTitle'),
      message: t('browser.resetConfirmAgain', { n }),
      confirmLabel: t('browser.resetForSure'),
      danger: true,
    })
    if (second)
      await run(() => repo.resetCards([...selected], Date.now()), t('browser.resetDone', { n }))
  }

  async function remove() {
    const notes = selectedNoteIds.length
    const ok = await confirmAction({
      title: t('browser.deleteTitle'),
      message: t('browser.deleteConfirm', { notes, cards: selectedRows.length }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    await run(
      async () => {
        const ids = [...selectedNoteIds]
        await repo.deleteNotes(ids)
        selected.clear()
      },
      t('browser.deleted', { n: notes }),
    )
  }

  async function move() {
    if (!moveTarget) return
    moving = false
    await run(() => repo.moveNotes(selectedNoteIds, moveTarget, Date.now()), t('browser.moved'))
  }

  async function applyTags(add: boolean) {
    const list = parseTags(tagText)
    tagging = false
    await run(
      () => (add ? repo.addTags : repo.removeTags)(selectedNoteIds, list, Date.now()),
      t('browser.tagged'),
    )
  }
</script>

{#if selected.size > 0}
  <div class="row bulk" role="group" aria-label={t('browser.bulkActions')}>
    <button class="btn btn-sm" type="button" onclick={() => ((moveTarget = ''), (moving = true))}>
      {t('browser.move')}
    </button>
    <button class="btn btn-sm" type="button" onclick={() => ((tagText = ''), (tagging = true))}>
      {t('browser.tag')}
    </button>
    <button class="btn btn-sm" type="button" onclick={() => suspend(true)}>
      <Icon name="pause" />
      {t('review.suspend')}
    </button>
    <button class="btn btn-sm" type="button" onclick={() => suspend(false)}>
      {t('browser.unsuspend')}
    </button>
    <button class="btn btn-sm" type="button" onclick={() => (exporting = true)}>
      <Icon name="download" />
      {t('exportCsv.button')}
    </button>
    <button class="btn btn-sm" type="button" onclick={reset}>{t('browser.reset')}</button>
    <button class="btn btn-sm btn-danger" type="button" onclick={remove}>
      <Icon name="trash" />
      {t('common.delete')}
    </button>
    <button class="btn btn-sm btn-ghost" type="button" onclick={() => selected.clear()}>
      {t('browser.clearSelection')}
    </button>
  </div>
{/if}

<ExportDialog bind:open={exporting} noteIds={selectedNoteIds} name="recto-selection" />

<Dialog
  open={moving}
  title={t('browser.moveTitle', { n: selectedNoteIds.length })}
  onclose={() => (moving = false)}
>
  <div class="field">
    <label for="move-deck">{t('editor.deck')}</label>
    <DeckSelect id="move-deck" {decks} bind:value={moveTarget} noneLabel="—" />
  </div>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (moving = false)}>{t('common.cancel')}</button>
    <button class="btn btn-primary" type="button" disabled={!moveTarget} onclick={move}>
      {t('browser.move')}
    </button>
  {/snippet}
</Dialog>

<Dialog
  open={tagging}
  title={t('browser.tagTitle', { n: selectedNoteIds.length })}
  onclose={() => (tagging = false)}
>
  <div class="field">
    <label for="tag-text">{t('editor.tags')}</label>
    <input id="tag-text" type="text" bind:value={tagText} />
  </div>
  {#snippet actions()}
    <button class="btn" type="button" onclick={() => (tagging = false)}>{t('common.cancel')}</button
    >
    <button class="btn" type="button" disabled={!tagText.trim()} onclick={() => applyTags(false)}>
      {t('browser.removeTags')}
    </button>
    <button
      class="btn btn-primary"
      type="button"
      disabled={!tagText.trim()}
      onclick={() => applyTags(true)}
    >
      {t('browser.addTags')}
    </button>
  {/snippet}
</Dialog>

<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import type { Deck } from '$lib/domain/types'
  import { createBackup, BACKUP_EXTENSION } from '$lib/export/backup'
  import { downloadBlob, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { href, navigate, type RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import DeckSelect from '$lib/ui/DeckSelect.svelte'
  import DeckSettingsForm from '$lib/ui/DeckSettingsForm.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import ExportDialog from '$lib/ui/ExportDialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import Icon from '$lib/ui/Icon.svelte'
  import NewDeckDialog from '$lib/ui/NewDeckDialog.svelte'

  let { params }: RouteProps = $props()
  const deckId = $derived(params.id ?? '')

  const decks = live(() => repo.listDecks(), [])
  const counts = live(() => repo.deckCounts(), new Map())
  const deck = $derived(decks.value.find((d) => d.id === deckId))
  const parent = $derived(
    deck?.parentId ? decks.value.find((d) => d.id === deck.parentId) : undefined,
  )
  const children = $derived(decks.value.filter((d) => d.parentId === deckId))

  let name = $state('')
  let emoji = $state('')
  let description = $state('')
  let loadedFor = ''
  $effect(() => {
    if (deck && loadedFor !== deck.id) {
      loadedFor = deck.id
      name = deck.name
      emoji = deck.emoji ?? ''
      description = deck.description ?? ''
    }
  })

  let creatingChild = $state(false)
  let exporting = $state(false)
  let moving = $state(false)
  let merging = $state(false)
  let moveTarget = $state('')
  let mergeTarget = $state('')

  function count(d: Deck | undefined) {
    return d ? (counts.value.get(d.id)?.cards ?? 0) : 0
  }

  async function saveDetails(e: SubmitEvent) {
    e.preventDefault()
    try {
      await repo.updateDeck(deckId, { name, emoji: emoji.trim(), description }, Date.now())
      toast(t('deck.saved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function move() {
    try {
      await repo.moveDeck(deckId, moveTarget || null, Date.now())
      moving = false
      toast(t('deck.moved'))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  async function merge() {
    const target = decks.value.find((d) => d.id === mergeTarget)
    if (!deck || !target) return
    const ok = await confirmAction({
      title: t('deck.mergeTitle'),
      message: t('deck.mergeConfirm', { source: deck.name, target: target.name, n: count(deck) }),
      confirmLabel: t('deck.merge'),
    })
    if (!ok) return
    try {
      await repo.mergeDecks(deckId, target.id, Date.now())
      merging = false
      toast(t('deck.merged'))
      navigate(`/decks/${target.id}`)
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  /** SPEC §5.1: a full backup is downloaded automatically before any deletion. */
  async function remove() {
    if (!deck) return
    const c = await repo.countDeckContents(deckId)
    const ok = await confirmAction({
      title: t('deck.deleteTitle'),
      message: t('deck.deleteConfirm', {
        name: deck.name,
        decks: c.decks,
        notes: c.notes,
        cards: c.cards,
      }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      const now = Date.now()
      downloadBlob(
        await createBackup(now),
        timestampedName('recto-avant-suppression', BACKUP_EXTENSION, now),
      )
      await repo.deleteDeck(deckId)
      toast(t('deck.deleted'))
      navigate('/')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }
</script>

{#if decks.loaded && !deck}
  <section class="page">
    <h1 tabindex="-1">{t('errors.deckNotFound')}</h1>
    <p><a href="#/">{t('notFound.back')}</a></p>
  </section>
{:else if deck}
  <section class="page stack">
    <header class="stack">
      {#if parent}
        <a class="small link-target" href={`#/decks/${parent.id}`}>← {parent.name}</a>
      {/if}
      <h1 tabindex="-1">{deck.emoji ?? ''} {deck.name}</h1>
      {#if deck.description}<p class="muted">{deck.description}</p>{/if}
      <p class="muted tabular">{t('home.cardCount', { n: count(deck) })}</p>
      <div class="row">
        <a class="btn btn-primary" href={href('/notes/new', { deck: deck.id })}>
          <Icon name="plus" />
          {t('deck.addNote')}
        </a>
        <a class="btn" href={href('/cards', { deck: deck.id })}>
          <Icon name="cards" />
          {t('deck.browse')}
        </a>
        <a class="btn" href={href('/review', { deck: deck.id })}>{t('deck.review')}</a>
      </div>
    </header>

    {#if !deck.parentId}
      <section class="stack" aria-labelledby="sub-title">
        <div class="row spread">
          <h2 id="sub-title">{t('deck.subDecks')}</h2>
          <button class="btn btn-sm" type="button" onclick={() => (creatingChild = true)}>
            {t('deck.newSubDeck')}
          </button>
        </div>
        {#if children.length === 0}
          <p class="muted small">{t('deck.noSubDecks')}</p>
        {:else}
          <ul class="list">
            {#each children as child (child.id)}
              <li>
                <a href={`#/decks/${child.id}`}>{child.emoji ?? ''} {child.name}</a>
                <span class="muted small tabular">{t('home.cardCount', { n: count(child) })}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <section class="card-surface" aria-labelledby="details-title">
      <h2 id="details-title">{t('deck.details')}</h2>
      <form class="stack" onsubmit={saveDetails}>
        <div class="field">
          <label for="deck-name">{t('deck.name')}</label>
          <input id="deck-name" type="text" bind:value={name} required maxlength="120" />
        </div>
        <div class="field">
          <label for="deck-emoji">{t('deck.emoji')}</label>
          <input id="deck-emoji" type="text" bind:value={emoji} maxlength="8" />
        </div>
        <div class="field">
          <label for="deck-description">{t('deck.description')}</label>
          <textarea id="deck-description" bind:value={description} rows="2"></textarea>
        </div>
        <div class="row">
          <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        </div>
      </form>
    </section>

    {#key deck.id + deck.scheduler}
      <DeckSettingsForm {deck} />
    {/key}

    <section class="stack" aria-labelledby="actions-title">
      <h2 id="actions-title">{t('deck.actions')}</h2>
      <div class="row">
        <button
          class="btn"
          type="button"
          onclick={() => {
            moveTarget = deck?.parentId ?? ''
            moving = true
          }}>{t('deck.move')}</button
        >
        <button
          class="btn"
          type="button"
          onclick={() => {
            mergeTarget = ''
            merging = true
          }}>{t('deck.merge')}</button
        >
        <button class="btn" type="button" onclick={() => (exporting = true)}>
          <Icon name="download" />
          {t('exportCsv.button')}
        </button>
        <button class="btn btn-danger" type="button" onclick={remove}>
          <Icon name="trash" />
          {t('common.delete')}
        </button>
      </div>
      <p class="muted small">{t('deck.deleteHelp')}</p>
    </section>
  </section>

  <ExportDialog bind:open={exporting} deckId={deck.id} name={deck.name} />

  <NewDeckDialog
    bind:open={creatingChild}
    decks={decks.value}
    parentId={deck.id}
    oncreated={(d) => navigate(`/decks/${d.id}`)}
  />

  <Dialog open={moving} title={t('deck.moveTitle')} onclose={() => (moving = false)}>
    <div class="field">
      <label for="move-target">{t('deck.parent')}</label>
      <DeckSelect
        id="move-target"
        decks={decks.value}
        bind:value={moveTarget}
        exclude={[deck.id]}
        noneLabel={t('deck.noParent')}
        topLevelOnly
      />
    </div>
    {#if children.length > 0}<p class="muted small">{t('errors.deckNesting')}</p>{/if}
    {#snippet actions()}
      <button class="btn" type="button" onclick={() => (moving = false)}
        >{t('common.cancel')}</button
      >
      <button class="btn btn-primary" type="button" onclick={move}>{t('deck.move')}</button>
    {/snippet}
  </Dialog>

  <Dialog open={merging} title={t('deck.mergeTitle')} onclose={() => (merging = false)}>
    <p class="muted small">{t('deck.mergeHelp')}</p>
    <div class="field">
      <label for="merge-target">{t('deck.mergeInto')}</label>
      <DeckSelect
        id="merge-target"
        decks={decks.value}
        bind:value={mergeTarget}
        exclude={[deck.id, ...children.map((c) => c.id)]}
        noneLabel="—"
      />
    </div>
    {#snippet actions()}
      <button class="btn" type="button" onclick={() => (merging = false)}
        >{t('common.cancel')}</button
      >
      <button class="btn btn-primary" type="button" disabled={!mergeTarget} onclick={merge}>
        {t('deck.merge')}
      </button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 2.75rem;
    border-bottom: 1px solid var(--border);
  }
</style>

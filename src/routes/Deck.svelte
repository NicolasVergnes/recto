<script lang="ts">
  import { live } from '$lib/db/live.svelte'
  import * as repo from '$lib/db/repo'
  import type { Deck } from '$lib/domain/types'
  import { createBackup, BACKUP_EXTENSION } from '$lib/export/backup'
  import { downloadBlob, timestampedName } from '$lib/export/download'
  import { t } from '$lib/i18n'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { confirmAction } from '$lib/state/confirm.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import DeckActions from '$lib/ui/deck/DeckActions.svelte'
  import DeckDetailsForm from '$lib/ui/deck/DeckDetailsForm.svelte'
  import DeckHeader from '$lib/ui/deck/DeckHeader.svelte'
  import MergeDeckDialog from '$lib/ui/deck/MergeDeckDialog.svelte'
  import MoveDeckDialog from '$lib/ui/deck/MoveDeckDialog.svelte'
  import SubDeckList from '$lib/ui/deck/SubDeckList.svelte'
  import DeckSettingsForm from '$lib/ui/DeckSettingsForm.svelte'
  import ExportDialog from '$lib/ui/ExportDialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
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

  let creatingChild = $state(false)
  let exporting = $state(false)
  let moving = $state(false)
  let merging = $state(false)
  let moveTarget = $state('')
  let mergeTarget = $state('')

  function count(d: Deck | undefined) {
    return d ? (counts.value.get(d.id)?.cards ?? 0) : 0
  }

  function openMove() {
    moveTarget = deck?.parentId ?? ''
    moving = true
  }

  function openMerge() {
    mergeTarget = ''
    merging = true
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
      await repo.deleteDeck(deckId, Date.now())
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
    <DeckHeader {deck} {parent} cardCount={count(deck)} />

    {#if !deck.parentId}
      <SubDeckList subDecks={children} countCards={count} onnew={() => (creatingChild = true)} />
    {/if}

    <DeckDetailsForm {deck} />

    {#key deck.id + deck.scheduler}
      <DeckSettingsForm {deck} />
    {/key}

    <DeckActions
      onmove={openMove}
      onmerge={openMerge}
      onexport={() => (exporting = true)}
      onremove={remove}
    />
  </section>

  <ExportDialog bind:open={exporting} deckId={deck.id} name={deck.name} />

  <NewDeckDialog
    bind:open={creatingChild}
    decks={decks.value}
    parentId={deck.id}
    oncreated={(d) => navigate(`/decks/${d.id}`)}
  />

  <MoveDeckDialog
    open={moving}
    decks={decks.value}
    deckId={deck.id}
    hasSubDecks={children.length > 0}
    bind:target={moveTarget}
    onmove={move}
    onclose={() => (moving = false)}
  />

  <MergeDeckDialog
    open={merging}
    decks={decks.value}
    exclude={[deck.id, ...children.map((c) => c.id)]}
    bind:target={mergeTarget}
    onmerge={merge}
    onclose={() => (merging = false)}
  />
{/if}

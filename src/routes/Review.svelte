<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { t } from '$lib/i18n'
  import { stopSounds } from '$lib/media/audio'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { prefs } from '$lib/state/prefs.svelte'
  import { endSession } from '$lib/state/session.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import Icon from '$lib/ui/Icon.svelte'
  import AnswerBar from '$lib/ui/review/AnswerBar.svelte'
  import CardInfo from '$lib/ui/review/CardInfo.svelte'
  import { ReviewController } from '$lib/ui/review/controller.svelte'
  import Flashcard from '$lib/ui/review/Flashcard.svelte'
  import { preventsDefault, reviewKeyAction } from '$lib/ui/review/keys'
  import LearningWait from '$lib/ui/review/LearningWait.svelte'
  import ReviewMenu from '$lib/ui/review/ReviewMenu.svelte'
  import ReviewProgress from '$lib/ui/review/ReviewProgress.svelte'
  import SessionSummary from '$lib/ui/review/SessionSummary.svelte'

  let { query }: RouteProps = $props()

  const c = new ReviewController()
  let answerBar: AnswerBar | undefined = $state()
  let showButton: HTMLButtonElement | undefined = $state()
  let pointerX: number | null = null

  // Session start / resume, once per screen.
  $effect(() => {
    void c.start(untrack(() => query.deck))
    return () => stopSounds()
  })

  // Focus on each new card.
  $effect(() => {
    if (!c.currentId) return
    void tick().then(() => answerBar?.focusQuestion())
  })

  async function reveal() {
    if (!c.card || c.revealed) return
    c.revealed = true
    await tick()
    answerBar?.focusRatings()
  }

  function edit() {
    if (c.note) navigate(`/notes/${c.note.id}`)
  }

  function quit() {
    stopSounds()
    navigate('/')
  }

  function finish() {
    endSession()
    navigate('/')
  }

  function onKeydown(e: KeyboardEvent) {
    const action = reviewKeyAction(e, {
      revealed: c.revealed,
      infoOpen: c.infoOpen,
      showButton,
      ratings: c.ratings,
      deck: c.deck,
    })
    if (!action) return
    if (preventsDefault(action)) e.preventDefault()
    if (action.kind === 'undo') void c.undo()
    else if (action.kind === 'reveal') void reveal()
    else if (action.kind === 'rate') void c.rate(action.rating)
    else if (action.kind === 'edit') edit()
    else c.replay()
  }

  // Optional swipe gestures (04-UI §2.2): right = Good, left = Again.
  function onPointerDown(e: PointerEvent) {
    pointerX = prefs.swipeGestures && c.revealed ? e.clientX : null
  }
  function onPointerUp(e: PointerEvent) {
    if (pointerX === null) return
    const dx = e.clientX - pointerX
    pointerX = null
    if (Math.abs(dx) > 80) void c.rate(dx > 0 ? 3 : 1)
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="review" aria-labelledby="review-title">
  <header class="bar">
    <button class="btn btn-ghost btn-sm" type="button" onclick={quit}>
      <Icon name="close" />
      <span class="visually-hidden">{t('review.quit')}</span>
    </button>
    <h1 id="review-title" class="visually-hidden" tabindex="-1">{t('review.title')}</h1>
    <ReviewProgress done={c.active?.stats.answers ?? 0} remaining={c.remaining} />
    <ReviewMenu
      bind:open={c.menuOpen}
      canUndo={!!c.active && c.active.undo.length > 0}
      hasCard={!!c.card}
      flagged={!!c.card?.flag}
      retireAllowed={c.retireAllowed}
      onundo={() => c.undo()}
      onedit={edit}
      onsuspend={() => c.suspend()}
      onretire={() => c.retire()}
      onflag={() => c.toggleFlag()}
      oninfo={() => (c.infoOpen = true)}
    />
  </header>

  {#if c.loading}
    <p class="page muted">{t('review.loading')}</p>
  {:else if c.card && c.rendered && c.deck}
    <div class="stage" role="presentation" onpointerdown={onPointerDown} onpointerup={onPointerUp}>
      <Flashcard
        rendered={c.rendered}
        revealed={c.revealed}
        flagged={!!c.card.flag}
        diff={c.diff}
        typed={c.typed}
      />
    </div>
    <AnswerBar
      bind:this={answerBar}
      bind:showButton
      bind:typed={c.typed}
      revealed={c.revealed}
      typedMode={c.typedMode}
      kind={c.deck.scheduler}
      ratings={c.ratings}
      previews={c.previews}
      suggested={c.suggested}
      busy={c.busy}
      onreveal={reveal}
      onrate={(rating) => c.rate(rating)}
    />
  {:else if c.canWait}
    <LearningWait due={c.nextLater} now={c.now} bind:waiting={c.waiting} onfinish={finish} />
  {:else if c.finished && c.active}
    <SessionSummary
      stats={c.active.stats}
      sleepTip={c.sleepTip}
      canUndo={c.active.undo.length > 0}
      onfinish={finish}
      onundo={() => c.undo()}
    />
  {/if}
</section>

{#if c.card && c.deck && c.infoOpen}
  <Dialog open={c.infoOpen} title={t('review.info')} onclose={() => (c.infoOpen = false)}>
    <CardInfo
      card={c.card}
      deck={c.deck}
      reviews={c.history}
      retrievability={c.scheduler?.retrievability(c.card, Date.now(), c.deck) ?? null}
    />
    {#snippet actions()}
      <button class="btn" type="button" onclick={() => (c.infoOpen = false)}
        >{t('common.close')}</button
      >
    {/snippet}
  </Dialog>
{/if}

<style>
  .review {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    max-width: var(--content-width);
    margin: 0 auto;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) 0;
  }

  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-3);
    touch-action: pan-y pinch-zoom;
  }
</style>

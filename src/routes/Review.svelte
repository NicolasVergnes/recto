<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import * as repo from '$lib/db/repo'
  import { getSetting, setSetting } from '$lib/db/settings'
  import { cardReviews, loadTodayQueue, recordReview, setRetired, undoReview } from '$lib/db/study'
  import { renderCard } from '$lib/domain/notes'
  import { extractSounds } from '$lib/domain/text'
  import { compareTyped, suggestRating } from '$lib/domain/typed'
  import type { Rating, Review } from '$lib/domain/types'
  import { t } from '$lib/i18n'
  import { playSounds, stopSounds } from '$lib/media/audio'
  import { afterAnswer, putBack, removeCard, takeDue } from '$lib/queue/session'
  import { navigate, type RouteProps } from '$lib/router.svelte'
  import { canRetire, getScheduler } from '$lib/scheduler'
  import { dayKey } from '$lib/scheduler/day'
  import { endSession, session } from '$lib/state/session.svelte'
  import { prefs } from '$lib/state/prefs.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import CardContent from '$lib/ui/CardContent.svelte'
  import Dialog from '$lib/ui/Dialog.svelte'
  import { errorMessage } from '$lib/ui/errors'
  import { formatInterval } from '$lib/ui/format'
  import Icon from '$lib/ui/Icon.svelte'
  import CardInfo from '$lib/ui/review/CardInfo.svelte'
  import RatingButtons from '$lib/ui/review/RatingButtons.svelte'
  import TypedDiff from '$lib/ui/review/TypedDiff.svelte'

  let { query }: RouteProps = $props()

  const WAIT_OFFER_MS = 30 * 60_000

  let loading = $state(true)
  let revealed = $state(false)
  let typed = $state('')
  let busy = $state(false)
  let now = $state(Date.now())
  let history = $state<Review[]>([])
  let menuOpen = $state(false)
  let infoOpen = $state(false)
  let waiting = $state(false)
  let sleepTip = $state(false)
  let shownAt = Date.now()
  let showButton: HTMLButtonElement | undefined = $state()
  let typedInput: HTMLInputElement | undefined = $state()
  let ratingButtons: RatingButtons | undefined = $state()
  let pointerX: number | null = null

  const s = $derived(session.active)
  const currentId = $derived(s?.queue.ids[0])
  const card = $derived(currentId ? s?.cards.get(currentId) : undefined)
  const note = $derived(card ? s?.notes.get(card.noteId) : undefined)
  const deck = $derived(card ? s?.decks.get(card.deckId) : undefined)
  const schedulers = $derived({
    fsrs: getScheduler('fsrs', { dayStartHour: s?.dayStartHour ?? 4 }),
    leitner: getScheduler('leitner', { dayStartHour: s?.dayStartHour ?? 4 }),
  })
  const scheduler = $derived(deck ? schedulers[deck.scheduler] : undefined)
  const rendered = $derived(
    card && note && deck
      ? renderCard(note, card, deck.scheduler === 'leitner' && deck.settings.leitner.alternateSides)
      : undefined,
  )
  const ratings = $derived(scheduler && deck ? scheduler.ratings(deck) : [])
  const previews = $derived(
    revealed && card && deck && scheduler ? scheduler.preview(card, Date.now(), deck) : {},
  )
  const typedMode = $derived(!!deck?.settings.typedAnswer)
  const diff = $derived(
    revealed && typedMode && rendered ? compareTyped(rendered.expected, typed) : null,
  )
  const suggested = $derived(diff ? suggestRating(diff, ratings) : null)
  const retireAllowed = $derived(card ? canRetire(card, history) : false)
  const nextLater = $derived(s?.queue.later[0]?.due ?? null)
  const finished = $derived(!loading && !!s && !currentId)
  const canWait = $derived(finished && nextLater !== null && nextLater - now < WAIT_OFFER_MS)
  const remaining = $derived.by(() => {
    const out = { learning: 0, review: 0, new: 0 }
    if (!s) return out
    for (const id of [...s.queue.ids, ...s.queue.later.map((l) => l.id)]) {
      const c = s.cards.get(id)
      if (!c) continue
      if (c.state === 0) out.new++
      else if (c.state === 2) out.review++
      else out.learning++
    }
    return out
  })
  const progress = $derived.by(() => {
    const done = s?.stats.answers ?? 0
    const left = remaining.learning + remaining.review + remaining.new
    return done + left === 0 ? 1 : done / (done + left)
  })

  // ─── Session start / resume ────────────────────────────────────────────────

  $effect(() => {
    void start()
    return () => stopSounds()
  })

  async function start() {
    const t0 = Date.now()
    const hour = await getSetting('dayStartHour')
    const key = `${query.deck ?? '*'}:${dayKey(t0, hour)}`
    const active = session.active
    if (active && active.key === key && active.queue.ids.length + active.queue.later.length > 0) {
      await refresh()
    } else {
      const q = await loadTodayQueue(t0, query.deck)
      const notes = await repo.getNotes([...new Set([...q.cards.values()].map((c) => c.noteId))])
      session.active = {
        key,
        deckId: query.deck,
        queue: { ids: q.result.ids, later: q.result.later },
        cards: new SvelteMap(q.cards),
        notes: new SvelteMap(notes.map((n) => [n.id, n])),
        decks: new SvelteMap(q.decks.map((d) => [d.id, d])),
        dueLimit: q.result.dueLimit,
        dayStartHour: q.dayStartHour,
        stats: { answers: 0, again: 0, totalMs: 0, startedAt: t0 },
        undo: [],
      }
    }
    advance()
    loading = false
  }

  /** After editing a card elsewhere: reload the session's cards, notes and decks. */
  async function refresh() {
    const active = session.active
    if (!active) return
    const ids = [...active.queue.ids, ...active.queue.later.map((l) => l.id)]
    const cards = (await repo.getCards(ids)).filter((c) => !c.suspended && !c.retired)
    const notes = await repo.getNotes([...new Set(cards.map((c) => c.noteId))])
    const decks = await repo.listDecks()
    const alive = new Set(cards.map((c) => c.id))
    let queue = active.queue
    for (const id of ids) if (!alive.has(id)) queue = removeCard(queue, id)
    active.queue = queue
    active.cards = new SvelteMap(cards.map((c) => [c.id, c]))
    active.notes = new SvelteMap(notes.map((n) => [n.id, n]))
    active.decks = new SvelteMap(decks.map((d) => [d.id, d]))
  }

  /** Brings due learning cards forward and resets the question state. */
  function advance() {
    const active = session.active
    if (active) active.queue = takeDue(active.queue, Date.now())
    revealed = false
    typed = ''
    menuOpen = false
    shownAt = Date.now()
    now = Date.now()
  }

  // Per-card side effects: history (P7, infos), autoplay, focus.
  $effect(() => {
    const id = currentId
    if (!id) return
    void cardReviews(id).then((rows) => {
      if (currentId === id) history = rows
    })
    void tick().then(() => (typedMode ? typedInput : showButton)?.focus())
  })

  // Autoplay (SPEC §5.3): the side that contains sounds, once per card and per side.
  $effect(() => {
    const id = currentId
    const shown = revealed
    if (!id) return
    untrack(() => {
      if (!rendered || !deck?.settings.autoplayAudio) return
      const side = shown ? `${rendered.answer} ${rendered.extra}` : rendered.question
      const sounds = extractSounds(side).sounds
      if (sounds.length > 0) void playSounds(sounds)
    })
  })

  // Waiting for learning cards: tick every second, resume when one is due.
  $effect(() => {
    if (!waiting) return
    const timer = setInterval(() => {
      now = Date.now()
      if (nextLater !== null && now >= nextLater) {
        waiting = false
        advance()
      }
    }, 1000)
    return () => clearInterval(timer)
  })

  // Sleep tip once per day at the end of the first session (srs-rules §1, Mazza 2016).
  $effect(() => {
    if (!finished || canWait || !s || s.stats.answers === 0) return
    const today = dayKey(Date.now(), s.dayStartHour)
    void getSetting('sleepTipDay').then(async (day) => {
      if (day !== today) {
        sleepTip = true
        await setSetting('sleepTipDay', today)
      }
    })
  })

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function reveal() {
    if (!card || revealed) return
    revealed = true
    await tick()
    ratingButtons?.focusFirst()
  }

  async function rate(rating: Rating) {
    const active = session.active
    if (!active || !card || !deck || !scheduler || !revealed || busy) return
    busy = true
    const answeredAt = Date.now()
    try {
      const outcome = scheduler.answer(card, rating, answeredAt, deck)
      const durationMs = answeredAt - shownAt
      const review = await recordReview(outcome, durationMs)
      active.undo = [
        ...active.undo.slice(-19),
        {
          previous: card,
          reviewId: review.id,
          queue: active.queue,
          rating,
          durationMs: review.durationMs,
        },
      ]
      active.cards.set(card.id, outcome.card)
      active.queue = afterAnswer(active.queue, card.id, outcome.card, answeredAt, active.dueLimit)
      active.stats.answers++
      if (rating === 1) active.stats.again++
      active.stats.totalMs += review.durationMs
      advance()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  async function undo() {
    const active = session.active
    const entry = active?.undo.at(-1)
    if (!active || !entry || busy) return
    // The undo stack lives in deep $state: take plain copies before writing to IndexedDB.
    const last = $state.snapshot(entry)
    busy = true
    try {
      await undoReview(last.previous, last.reviewId)
      active.undo = active.undo.slice(0, -1)
      active.cards.set(last.previous.id, last.previous)
      active.queue = putBack(last.queue, last.previous.id)
      active.stats.answers--
      if (last.rating === 1) active.stats.again--
      active.stats.totalMs -= last.durationMs
      waiting = false
      advance()
      toast(t('review.undone'))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      busy = false
    }
  }

  async function suspend() {
    const active = session.active
    if (!active || !card) return
    await repo.setSuspended([card.id], true)
    active.queue = removeCard(active.queue, card.id)
    toast(t('review.suspended'))
    advance()
  }

  async function retire() {
    const active = session.active
    if (!active || !card || !retireAllowed) return
    try {
      await setRetired(card.id, true)
      active.queue = removeCard(active.queue, card.id)
      toast(t('review.retired'))
      advance()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function toggleFlag() {
    const active = session.active
    if (!active || !card) return
    const flag = card.flag === 0 ? 1 : 0
    await repo.setFlag([card.id], flag)
    active.cards.set(card.id, { ...card, flag })
    menuOpen = false
    toast(t(flag ? 'review.flagged' : 'review.unflagged'))
  }

  function edit() {
    if (note) navigate(`/notes/${note.id}`)
  }

  function replay() {
    if (!rendered) return
    const side = revealed
      ? `${rendered.question} ${rendered.answer} ${rendered.extra}`
      : rendered.question
    void playSounds(extractSounds(side).sounds)
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
    const target = e.target
    const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      void undo()
      return
    }
    if (inField || e.ctrlKey || e.metaKey || e.altKey || infoOpen) return
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      // Buttons handle their own Enter/Space activation.
      if (target instanceof HTMLButtonElement && target !== showButton) return
      e.preventDefault()
      void reveal()
    } else if (revealed && /^[1-4]$/.test(e.key)) {
      const rating = ratings[Number(e.key) - 1]
      if (rating) {
        e.preventDefault()
        void rate(rating)
      }
    } else if (
      revealed &&
      e.key === ' ' &&
      deck?.settings.fsrs.ratingMode === 2 &&
      deck.scheduler === 'fsrs'
    ) {
      e.preventDefault()
      void rate(3)
    } else if (e.key.toLowerCase() === 'e') edit()
    else if (e.key.toLowerCase() === 'r') replay()
  }

  function onTypedKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !revealed) {
      e.preventDefault()
      void reveal()
    }
  }

  // Optional swipe gestures (04-UI §2.2): right = Good, left = Again.
  function onPointerDown(e: PointerEvent) {
    pointerX = prefs.swipeGestures && revealed ? e.clientX : null
  }
  function onPointerUp(e: PointerEvent) {
    if (pointerX === null) return
    const dx = e.clientX - pointerX
    pointerX = null
    if (Math.abs(dx) > 80) void rate(dx > 0 ? 3 : 1)
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
    <div class="progress" aria-live="polite">
      <div class="track" aria-hidden="true">
        <div class="fill" style:width={`${progress * 100}%`}></div>
      </div>
      <p class="counts small tabular">
        <span class="learning">{t('review.leftLearning', { n: remaining.learning })}</span> ·
        <span class="reviews">{t('review.leftReview', { n: remaining.review })}</span> ·
        <span class="news">{t('review.leftNew', { n: remaining.new })}</span>
      </p>
    </div>
    <div class="menu">
      <button
        class="btn btn-ghost btn-sm"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="review-menu"
        onclick={() => (menuOpen = !menuOpen)}
      >
        <Icon name="more" />
        <span class="visually-hidden">{t('review.more')}</span>
      </button>
      {#if menuOpen}
        <ul id="review-menu" class="menu-list card-surface">
          <li>
            <button type="button" disabled={!s || s.undo.length === 0} onclick={undo}>
              <Icon name="undo" />
              {t('review.undo')} <kbd>Ctrl+Z</kbd>
            </button>
          </li>
          <li>
            <button type="button" disabled={!card} onclick={edit}>
              <Icon name="edit" />
              {t('review.edit')} <kbd>E</kbd>
            </button>
          </li>
          <li>
            <button type="button" disabled={!card} onclick={suspend}>
              <Icon name="pause" />
              {t('review.suspend')}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!card || !retireAllowed}
              aria-describedby={retireAllowed ? undefined : 'retire-help'}
              title={retireAllowed ? undefined : t('review.retireLocked')}
              onclick={retire}
            >
              <Icon name="archive" />
              {t('review.retire')}
            </button>
            {#if !retireAllowed}
              <p id="retire-help" class="small muted help">{t('review.retireLocked')}</p>
            {/if}
          </li>
          <li>
            <button type="button" disabled={!card} onclick={toggleFlag}>
              <Icon name="flag" />
              {t(card?.flag ? 'review.unflag' : 'review.flag')}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!card}
              onclick={() => ((infoOpen = true), (menuOpen = false))}
            >
              <Icon name="info" />
              {t('review.info')}
            </button>
          </li>
        </ul>
      {/if}
    </div>
  </header>

  {#if loading}
    <p class="page muted">{t('review.loading')}</p>
  {:else if card && rendered && deck}
    <div class="stage" role="presentation" onpointerdown={onPointerDown} onpointerup={onPointerUp}>
      <article class="card-surface flashcard" aria-label={t('review.cardLabel')}>
        {#if rendered.flipped}
          <p class="badge small" title={t('review.flippedHelp')}>↔ {t('review.flipped')}</p>
        {/if}
        {#if card.flag}
          <p class="badge small flag"><Icon name="flag" size={14} /> {t('review.flag')}</p>
        {/if}
        {#if !revealed || !rendered.answerReplacesQuestion}
          <div class="side question"><CardContent html={rendered.question} /></div>
        {/if}
        <!-- P1: the answer is not in the DOM before the user asks for it. -->
        {#if revealed}
          {#if rendered.answerReplacesQuestion}
            <div class="side"><CardContent html={rendered.answer} /></div>
          {:else}
            <hr />
            <div class="side answer"><CardContent html={rendered.answer} /></div>
          {/if}
          {#if rendered.extra}
            <div class="extra"><CardContent html={rendered.extra} /></div>
          {/if}
          {#if diff}
            <TypedDiff parts={diff} {typed} />
          {/if}
        {/if}
      </article>
    </div>

    <footer class="actions">
      {#if !revealed}
        {#if typedMode}
          <label class="visually-hidden" for="typed">{t('review.typedLabel')}</label>
          <input
            id="typed"
            bind:this={typedInput}
            bind:value={typed}
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder={t('review.typedPlaceholder')}
            onkeydown={onTypedKeydown}
          />
        {/if}
        <button
          bind:this={showButton}
          class="btn btn-primary btn-block show"
          type="button"
          onclick={reveal}
        >
          {t('review.showAnswer')}
        </button>
      {:else}
        <RatingButtons
          bind:this={ratingButtons}
          kind={deck.scheduler}
          {ratings}
          {previews}
          {suggested}
          disabled={busy}
          onrate={rate}
        />
      {/if}
      <p class="muted small shortcuts">
        {t(revealed ? 'review.shortcutsAnswer' : 'review.shortcutsQuestion', { n: ratings.length })}
      </p>
    </footer>
  {:else if canWait}
    <div class="page stack end">
      <h2>{t('review.learningSoon')}</h2>
      <p>
        {t('review.learningSoonText', {
          when: formatInterval(Math.max(0, (nextLater ?? now) - now)),
        })}
      </p>
      <div class="row">
        {#if waiting}
          <p class="muted" aria-live="polite">{t('review.waiting')}</p>
        {:else}
          <button class="btn btn-primary" type="button" onclick={() => (waiting = true)}>
            {t('review.wait')}
          </button>
        {/if}
        <button class="btn" type="button" onclick={finish}>{t('review.finish')}</button>
      </div>
    </div>
  {:else if finished && s}
    <div class="page stack end">
      <h2>{t(s.stats.answers > 0 ? 'review.sessionDone' : 'review.nothingToDo')}</h2>
      {#if s.stats.answers > 0}
        <dl class="summary tabular">
          <div>
            <dt>{t('review.summarySeen')}</dt>
            <dd>{s.stats.answers}</dd>
          </div>
          <div>
            <dt>{t('review.summarySuccess')}</dt>
            <dd>
              {t('common.percent', {
                n: Math.round(((s.stats.answers - s.stats.again) / s.stats.answers) * 100),
              })}
            </dd>
          </div>
          <div>
            <dt>{t('review.summaryTime')}</dt>
            <dd>{formatInterval(Math.max(60_000, s.stats.totalMs))}</dd>
          </div>
        </dl>
      {:else}
        <p class="muted">{t('home.nothingDue')}</p>
      {/if}
      {#if sleepTip}<p class="notice">{t('review.sleepTip')}</p>{/if}
      <div class="row">
        <button class="btn btn-primary" type="button" onclick={finish}
          >{t('review.backHome')}</button
        >
        {#if s.undo.length > 0}
          <button class="btn" type="button" onclick={undo}>{t('review.undo')}</button>
        {/if}
      </div>
    </div>
  {/if}
</section>

{#if card && deck && infoOpen}
  <Dialog open={infoOpen} title={t('review.info')} onclose={() => (infoOpen = false)}>
    <CardInfo
      {card}
      {deck}
      reviews={history}
      retrievability={scheduler?.retrievability(card, Date.now(), deck) ?? null}
    />
    {#snippet actions()}
      <button class="btn" type="button" onclick={() => (infoOpen = false)}
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

  .progress {
    flex: 1;
  }

  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width var(--duration) ease;
  }

  .counts {
    margin: var(--space-1) 0 0;
    text-align: center;
    color: var(--text-2);
  }

  .menu {
    position: relative;
  }

  .menu-list {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 20;
    min-width: 15rem;
    list-style: none;
    margin: var(--space-1) 0 0;
    padding: var(--space-1);
  }

  .menu-list button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-2);
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .menu-list button:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .menu-list button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-list kbd {
    margin-left: auto;
  }

  .help {
    margin: 0 var(--space-2) var(--space-2);
  }

  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--space-3);
    touch-action: pan-y;
  }

  .flashcard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    justify-content: center;
    text-align: center;
    min-height: 40vh;
  }

  .side {
    width: 100%;
  }

  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--border);
    margin: 0;
  }

  .extra {
    color: var(--text-2);
    --card-font: calc(1rem * var(--font-scale));
  }

  .badge {
    align-self: center;
    margin: 0;
    padding: 0 var(--space-2);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--text);
  }

  .badge.flag {
    background: var(--danger-soft);
  }

  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom));
    background: var(--bg);
  }

  .show {
    min-height: 3.5rem;
    font-size: 1.05rem;
  }

  .shortcuts {
    margin: 0;
    text-align: center;
  }

  @media (max-width: 899px) {
    .shortcuts {
      display: none;
    }
  }

  .end {
    padding-top: var(--space-8);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    margin: 0;
  }

  .summary div {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: center;
  }

  .summary dt {
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .summary dd {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }
</style>

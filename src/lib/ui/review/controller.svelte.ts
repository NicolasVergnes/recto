import { untrack } from 'svelte'
import * as repo from '$lib/db/repo'
import { getSetting, setSetting } from '$lib/db/settings'
import { cardReviews, recordReview, setRetired, undoReview } from '$lib/db/study'
import { renderCard } from '$lib/domain/notes'
import { extractSounds } from '$lib/domain/text'
import { compareTyped, suggestRating } from '$lib/domain/typed'
import type { Rating, Review } from '$lib/domain/types'
import { t } from '$lib/i18n'
import { playSounds } from '$lib/media/audio'
import { afterAnswer, putBack, remainingByState, removeCard, takeDue } from '$lib/queue/session'
import { canRetire, getScheduler } from '$lib/scheduler'
import { dayKey } from '$lib/scheduler/day'
import { loadSession, session } from '$lib/state/session.svelte'
import { toast } from '$lib/state/toast.svelte'
import { errorMessage } from '$lib/ui/errors'

const WAIT_OFFER_MS = 30 * 60_000

/**
 * State and actions of the review screen over the in-memory session (`session.svelte.ts`).
 * Build it during component initialisation: the constructor registers the per-card effects
 * (history, autoplay, waiting timer, sleep tip).
 */
export class ReviewController {
  loading = $state(true)
  revealed = $state(false)
  typed = $state('')
  busy = $state(false)
  now = $state(Date.now())
  history = $state<Review[]>([])
  menuOpen = $state(false)
  infoOpen = $state(false)
  waiting = $state(false)
  sleepTip = $state(false)
  #shownAt = Date.now()

  readonly active = $derived(session.active)
  readonly currentId = $derived(this.active?.queue.ids[0])
  readonly card = $derived(this.currentId ? this.active?.cards.get(this.currentId) : undefined)
  readonly note = $derived(this.card ? this.active?.notes.get(this.card.noteId) : undefined)
  readonly deck = $derived(this.card ? this.active?.decks.get(this.card.deckId) : undefined)
  readonly schedulers = $derived({
    fsrs: getScheduler('fsrs', { dayStartHour: this.active?.dayStartHour ?? 4 }),
    leitner: getScheduler('leitner', { dayStartHour: this.active?.dayStartHour ?? 4 }),
  })
  readonly scheduler = $derived(this.deck ? this.schedulers[this.deck.scheduler] : undefined)
  readonly rendered = $derived(
    this.card && this.note && this.deck
      ? renderCard(
          this.note,
          this.card,
          this.deck.scheduler === 'leitner' && this.deck.settings.leitner.alternateSides,
        )
      : undefined,
  )
  readonly ratings = $derived(this.scheduler && this.deck ? this.scheduler.ratings(this.deck) : [])
  readonly previews = $derived(
    this.revealed && this.card && this.deck && this.scheduler
      ? this.scheduler.preview(this.card, Date.now(), this.deck)
      : {},
  )
  readonly typedMode = $derived(!!this.deck?.settings.typedAnswer)
  readonly diff = $derived(
    this.revealed && this.typedMode && this.rendered
      ? compareTyped(this.rendered.expected, this.typed)
      : null,
  )
  readonly suggested = $derived(this.diff ? suggestRating(this.diff, this.ratings) : null)
  readonly retireAllowed = $derived(this.card ? canRetire(this.card, this.history) : false)
  readonly nextLater = $derived(this.active?.queue.later[0]?.due ?? null)
  readonly finished = $derived(!this.loading && !!this.active && !this.currentId)
  readonly canWait = $derived(
    this.finished && this.nextLater !== null && this.nextLater - this.now < WAIT_OFFER_MS,
  )
  readonly remaining = $derived(
    this.active
      ? remainingByState(this.active.queue, this.active.cards)
      : { learning: 0, review: 0, new: 0 },
  )

  constructor() {
    // Per-card history (P7, infos).
    $effect(() => {
      const id = this.currentId
      if (!id) return
      void cardReviews(id).then((rows) => {
        if (this.currentId === id) this.history = rows
      })
    })

    // Autoplay (SPEC §5.3): the side that contains sounds, once per card and per side.
    $effect(() => {
      const id = this.currentId
      const shown = this.revealed
      if (!id) return
      untrack(() => {
        const r = this.rendered
        if (!r || !this.deck?.settings.autoplayAudio) return
        const side = shown ? `${r.answer} ${r.extra}` : r.question
        const sounds = extractSounds(side).sounds
        if (sounds.length > 0) void playSounds(sounds)
      })
    })

    // Waiting for learning cards: tick every second, resume when one is due.
    $effect(() => {
      if (!this.waiting) return
      const timer = setInterval(() => {
        this.now = Date.now()
        if (this.nextLater !== null && this.now >= this.nextLater) {
          this.waiting = false
          this.advance()
        }
      }, 1000)
      return () => clearInterval(timer)
    })

    // Sleep tip once per day at the end of the first session (srs-rules §1, Mazza 2016).
    $effect(() => {
      if (!this.finished || this.canWait || !this.active || this.active.stats.answers === 0) return
      const today = dayKey(Date.now(), this.active.dayStartHour)
      void getSetting('sleepTipDay').then(async (day) => {
        if (day !== today) {
          this.sleepTip = true
          await setSetting('sleepTipDay', today)
        }
      })
    })
  }

  /** Resumes today's session for this deck (after an edit) or starts a new one. */
  async start(deckId: string | undefined): Promise<void> {
    session.active = await loadSession(deckId, Date.now())
    this.advance()
    this.loading = false
  }

  /** Brings due learning cards forward and resets the question state. */
  advance(): void {
    const active = session.active
    if (active) active.queue = takeDue(active.queue, Date.now())
    this.revealed = false
    this.typed = ''
    this.menuOpen = false
    this.#shownAt = Date.now()
    this.now = Date.now()
  }

  async rate(rating: Rating): Promise<void> {
    const { card, deck, scheduler } = this
    const active = session.active
    if (!active || !card || !deck || !scheduler || !this.revealed || this.busy) return
    this.busy = true
    const answeredAt = Date.now()
    try {
      const outcome = scheduler.answer(card, rating, answeredAt, deck)
      const review = await recordReview(outcome, answeredAt - this.#shownAt)
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
      this.advance()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      this.busy = false
    }
  }

  async undo(): Promise<void> {
    const active = session.active
    const entry = active?.undo.at(-1)
    if (!active || !entry || this.busy) return
    // The undo stack lives in deep $state: take plain copies before writing to IndexedDB.
    const last = $state.snapshot(entry)
    this.busy = true
    try {
      await undoReview(last.previous, last.reviewId)
      active.undo = active.undo.slice(0, -1)
      active.cards.set(last.previous.id, last.previous)
      active.queue = putBack(last.queue, last.previous.id)
      active.stats.answers--
      if (last.rating === 1) active.stats.again--
      active.stats.totalMs -= last.durationMs
      this.waiting = false
      this.advance()
      toast(t('review.undone'))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      this.busy = false
    }
  }

  async suspend(): Promise<void> {
    const { card } = this
    const active = session.active
    if (!active || !card) return
    await repo.setSuspended([card.id], true)
    active.queue = removeCard(active.queue, card.id)
    toast(t('review.suspended'))
    this.advance()
  }

  async retire(): Promise<void> {
    const { card } = this
    const active = session.active
    if (!active || !card || !this.retireAllowed) return
    try {
      await setRetired(card.id, true)
      active.queue = removeCard(active.queue, card.id)
      toast(t('review.retired'))
      this.advance()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async toggleFlag(): Promise<void> {
    const { card } = this
    const active = session.active
    if (!active || !card) return
    const flag = card.flag === 0 ? 1 : 0
    await repo.setFlag([card.id], flag)
    active.cards.set(card.id, { ...card, flag })
    this.menuOpen = false
    toast(t(flag ? 'review.flagged' : 'review.unflagged'))
  }

  replay(): void {
    const r = this.rendered
    if (!r) return
    const side = this.revealed ? `${r.question} ${r.answer} ${r.extra}` : r.question
    void playSounds(extractSounds(side).sounds)
  }
}

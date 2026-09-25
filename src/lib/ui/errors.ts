import { RepoError, type RepoErrorCode } from '$lib/db/errors'
import { t, type MessageKey } from '$lib/i18n'

const KEYS: Record<RepoErrorCode, MessageKey> = {
  deckNameEmpty: 'errors.deckNameEmpty',
  deckNameTaken: 'errors.deckNameTaken',
  deckNotFound: 'errors.deckNotFound',
  deckNesting: 'errors.deckNesting',
  deckMergeSelf: 'errors.deckMergeSelf',
  noteNotFound: 'errors.noteNotFound',
  noteNoCloze: 'errors.noteNoCloze',
  noteNoMask: 'errors.noteNoMask',
  retireLocked: 'review.retireLocked',
  mediaType: 'errors.mediaType',
  mediaTooLarge: 'errors.mediaTooLarge',
  mediaUnreadable: 'errors.mediaUnreadable',
}

/** User-facing message for any error thrown by the repository or elsewhere. */
export function errorMessage(e: unknown): string {
  if (e instanceof RepoError) return t(KEYS[e.code])
  console.error(e)
  return t('errors.unexpected')
}

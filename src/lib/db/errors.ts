/** Business-rule violations raised by the repository; `code` maps to `errors.<code>` in fr.ts. */
export type RepoErrorCode =
  | 'deckNameEmpty'
  | 'deckNameTaken'
  | 'deckNotFound'
  | 'deckNesting'
  | 'deckMergeSelf'
  | 'noteNotFound'
  | 'noteNoCloze'
  | 'noteNoMask'
  | 'undoGone'
  | 'retireLocked'
  | 'mediaType'
  | 'mediaTooLarge'
  | 'mediaUnreadable'

export class RepoError extends Error {
  constructor(readonly code: RepoErrorCode) {
    super(code)
    this.name = 'RepoError'
  }
}

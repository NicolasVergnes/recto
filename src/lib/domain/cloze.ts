/** Anki cloze syntax `{{c1::answer}}` / `{{c1::answer::hint}}` (SPEC §5.2). Pure. */

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

/** Distinct cloze indices (≥ 1) present in the text, ascending. */
export function clozeIndices(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) {
    const n = Number(m[1])
    if (n > 0) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

function replaceClozes(text: string, fn: (index: number, answer: string, hint?: string) => string) {
  return text.replace(CLOZE_RE, (_m, n: string, answer: string, hint?: string) =>
    fn(Number(n), answer, hint),
  )
}

/** Question side: the target deletion becomes `[…]` (or `[hint]`), the others are shown. */
export function renderClozeQuestion(text: string, index: number): string {
  return replaceClozes(text, (n, answer, hint) =>
    n === index ? `<span class="cloze">[${hint ? hint : '…'}]</span>` : answer,
  )
}

/** Answer side: the target deletion is revealed and highlighted. */
export function renderClozeAnswer(text: string, index: number): string {
  return replaceClozes(text, (n, answer) =>
    n === index ? `<span class="cloze">${answer}</span>` : answer,
  )
}

/** The answers hidden by deletion `index` (for typed-answer comparison). */
export function clozeAnswers(text: string, index: number): string[] {
  const answers: string[] = []
  for (const m of text.matchAll(CLOZE_RE)) if (Number(m[1]) === index) answers.push(m[2] ?? '')
  return answers
}

/** Next index for Ctrl+Shift+C: one more than the highest present. */
export function nextClozeIndex(text: string): number {
  const indices = clozeIndices(text)
  return (indices[indices.length - 1] ?? 0) + 1
}

/** Wraps `text[start, end)` in a deletion; returns the new text and the caret position. */
export function wrapCloze(
  text: string,
  start: number,
  end: number,
  index = nextClozeIndex(text),
): { text: string; caret: number } {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const open = `{{c${index}::`
  const wrapped = `${before}${open}${selected}}}${text.slice(end)}`
  // Empty selection: put the caret inside the braces so the user types the answer.
  const caret = selected
    ? before.length + open.length + selected.length + 2
    : before.length + open.length
  return { text: wrapped, caret }
}

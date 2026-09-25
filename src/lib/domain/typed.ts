import { markMath, stripMathDelimiters } from './math'
import { stripHtml } from './text'
import type { Rating } from './types'

export type DiffKind = 'same' | 'wrong' | 'missing'

export interface DiffPart {
  text: string
  kind: DiffKind
}

const fold = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ')

/**
 * Character-by-character comparison of a typed answer (SPEC §5.3), by longest common
 * subsequence: `same` characters, `wrong` typed characters, `missing` expected characters.
 * Formulas are expected without their delimiters: `x^2` for `\(x^2\)`. Their source as
 * written, delimiters included, is accepted too when it matches better: an invalid formula
 * (a regex such as `\(\d+\)`) is displayed that way.
 */
export function compareTyped(expectedHtml: string, typed: string): DiffPart[] {
  const tex = stripHtml(stripMathDelimiters(expectedHtml))
  const source = stripHtml(markMath(expectedHtml))
  const parts = diff(tex, typed)
  if (source === tex) return parts
  const sourceParts = diff(source, typed)
  return similarity(sourceParts) > similarity(parts) ? sourceParts : parts
}

function diff(expected: string, typed: string): DiffPart[] {
  const a = [...fold(typed)]
  const b = [...fold(expected)]
  const eq = (x: string | undefined, y: string | undefined) =>
    x !== undefined && y !== undefined && x.toLocaleLowerCase('fr') === y.toLocaleLowerCase('fr')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i] as number[]
    const below = lcs[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] = eq(a[i], b[j]) ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const parts: DiffPart[] = []
  const push = (text: string, kind: DiffKind) => {
    const last = parts[parts.length - 1]
    if (last && last.kind === kind) last.text += text
    else parts.push({ text, kind })
  }
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && eq(a[i], b[j])) {
      push(b[j] ?? '', 'same')
      i++
      j++
    } else if (j < m && (i >= n || (lcs[i]?.[j + 1] ?? 0) >= (lcs[i + 1]?.[j] ?? 0))) {
      push(b[j] ?? '', 'missing')
      j++
    } else {
      push(a[i] ?? '', 'wrong')
      i++
    }
  }
  return parts
}

/** Share of expected characters found in order (0–1). */
export function similarity(parts: readonly DiffPart[]): number {
  const same = parts.filter((p) => p.kind === 'same').reduce((s, p) => s + p.text.length, 0)
  const total = parts.filter((p) => p.kind !== 'wrong').reduce((s, p) => s + p.text.length, 0)
  const wrong = parts.filter((p) => p.kind === 'wrong').reduce((s, p) => s + p.text.length, 0)
  return total + wrong === 0 ? 1 : same / Math.max(total, same + wrong)
}

/**
 * Suggested rating, always editable by the user (SPEC §5.3): exact (case-insensitive) → Good,
 * close (≥ 80 %) → Hard when available, otherwise Again.
 */
export function suggestRating(parts: readonly DiffPart[], ratings: readonly Rating[]): Rating {
  const exact = parts.every((p) => p.kind === 'same')
  if (exact) return 3
  if (similarity(parts) >= 0.8 && ratings.includes(2)) return 2
  return 1
}

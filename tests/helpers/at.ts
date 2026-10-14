/** `list[i]`, failing the test when there is no such entry (no non-null assertion). */
export function at<T>(list: readonly T[], i: number): T {
  const entry = list[i]
  if (entry === undefined) throw new Error(`no entry ${i}`)
  return entry
}

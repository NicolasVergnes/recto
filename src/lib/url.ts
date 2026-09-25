/** Pure helpers for the hash router (04-UI §1): `#/path?key=value`. */
export type Query = Record<string, string>
export type Params = Record<string, string>
export type QueryInput = Record<string, string | number | undefined>

export function parseHash(hash: string): { path: string; query: Query } {
  const raw = hash.replace(/^#/, '')
  const cut = raw.indexOf('?')
  const pathPart = cut === -1 ? raw : raw.slice(0, cut)
  const query: Query = {}
  if (cut !== -1) for (const [k, v] of new URLSearchParams(raw.slice(cut + 1))) query[k] = v
  const path = pathPart === '' ? '/' : pathPart.startsWith('/') ? pathPart : `/${pathPart}`
  return { path, query }
}

/** Builds `#/path?query`, skipping empty query values. */
export function href(path: string, query: QueryInput = {}): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') search.set(k, String(v))
  const qs = search.toString()
  return `#${path}${qs ? `?${qs}` : ''}`
}

/** Matches `/decks/:id` against `/decks/abc` → `{ id: 'abc' }`, or null. */
export function matchPath(pattern: string, path: string): Params | null {
  const p = pattern.split('/')
  const s = path.split('/')
  if (p.length !== s.length) return null
  const params: Params = {}
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] ?? ''
    const val = s[i] ?? ''
    if (seg.startsWith(':')) {
      if (val === '') return null
      params[seg.slice(1)] = decodeURIComponent(val)
    } else if (seg !== val) return null
  }
  return params
}

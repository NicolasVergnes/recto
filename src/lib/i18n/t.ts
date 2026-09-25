import { fr } from './fr'

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

/** Every dotted path to a string in `fr.ts`; an unknown key is a compile error. */
export type MessageKey = Leaves<typeof fr>
export type MessageParams = Readonly<Record<string, string | number>>

const numberFormat = new Intl.NumberFormat('fr-FR')

function flatten(node: object, prefix: string, out: Map<string, string>): Map<string, string> {
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') out.set(prefix + key, value)
    else if (typeof value === 'object' && value !== null) flatten(value, `${prefix}${key}.`, out)
  }
  return out
}

const messages = flatten(fr, '', new Map())

/** French typography: no-break space before « : ; ! ? % » and inside guillemets. */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?%»])/g, ' $1').replace(/« /g, '« ')
}

export function t(key: MessageKey, params?: MessageParams): string {
  const template = messages.get(key) ?? key
  const filled = params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name]
        if (value === undefined) return match
        return typeof value === 'number' ? numberFormat.format(value) : value
      })
    : template
  return frenchSpacing(filled)
}

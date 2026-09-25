import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(process.cwd(), 'data/samples')

/** Reads a fixture of data/samples (do not modify them without updating these tests). */
export function sampleText(name: string): string {
  return readFileSync(resolve(dir, name), 'utf8')
}

export function sampleBytes(name: string): Uint8Array<ArrayBuffer> {
  const buf = readFileSync(resolve(dir, name))
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

// Packs the plugin into tools/deck-builder/recto-deck-builder.zip (npm run plugin:zip).
// Dates are fixed so that the archive is reproducible and a rebuild changes nothing.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, 'recto-deck-builder.zip')
const SKIP = new Set(['README.md', 'build-zip.mjs', 'recto-deck-builder.zip', '__pycache__'])

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const files = {}
for (const path of walk(root).sort()) {
  const name = relative(root, path).split(sep).join('/')
  files[name] = [readFileSync(path), { mtime: new Date(Date.UTC(2026, 9, 13)) }]
}
writeFileSync(out, zipSync(files, { level: 9 }))
process.stdout.write(`${Object.keys(files).length} fichiers -> ${relative(process.cwd(), out)}\n`)

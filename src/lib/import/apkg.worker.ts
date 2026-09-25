/**
 * Reads an `.apkg` off the main thread (05 §2.2): sql.js (WASM) is loaded here, on demand, and
 * never enters the initial bundle. The .wasm file is precached by the service worker.
 */
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import {
  Anki21bUnsupported,
  ApkgError,
  readApkg,
  type ApkgErrorCode,
  type ApkgPackage,
} from './apkg-read'

export interface ApkgWorkerRequest {
  bytes: Uint8Array<ArrayBuffer>
}

export type ApkgWorkerResponse =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; pkg: ApkgPackage }
  | { type: 'error'; code: ApkgErrorCode | 'anki21b' }

function reply(message: ApkgWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

self.onmessage = async (event: MessageEvent<ApkgWorkerRequest>) => {
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const pkg = readApkg(event.data.bytes, SQL, (ratio) => reply({ type: 'progress', ratio }))
    reply(
      { type: 'done', pkg },
      pkg.media.map((m) => m.data.buffer),
    )
  } catch (e) {
    const code =
      e instanceof Anki21bUnsupported ? 'anki21b' : e instanceof ApkgError ? e.code : 'corrupt'
    reply({ type: 'error', code })
  }
}

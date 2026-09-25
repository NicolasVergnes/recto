/**
 * Builds an Anki package off the main thread (05 §4). sql.js (WASM) is loaded here, on demand,
 * exactly like the `.apkg` reader, and never enters the initial bundle. One request, one reply.
 */
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import {
  buildApkg,
  type ApkgExportInput,
  type ApkgExportOptions,
  type ApkgExportReport,
} from './apkg'

export interface ApkgExportRequest {
  input: ApkgExportInput
  options: ApkgExportOptions
}

export type ApkgExportResponse =
  | { type: 'done'; bytes: Uint8Array<ArrayBuffer>; report: ApkgExportReport }
  | { type: 'error'; message: string }

function reply(message: ApkgExportResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer })
}

self.onmessage = async (event: MessageEvent<ApkgExportRequest>) => {
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const { bytes, report } = await buildApkg(SQL, event.data.input, event.data.options)
    reply({ type: 'done', bytes, report }, [bytes.buffer])
  } catch (e) {
    reply({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

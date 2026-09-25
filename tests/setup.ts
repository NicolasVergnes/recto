import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'

// happy-dom and jsdom Blobs do not survive fake-indexeddb's structured clone; browsers' real
// Blobs do. Use Node's native Blob so stored media round-trip like in a browser.
Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true, writable: true })

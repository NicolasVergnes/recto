/** SHA-256 as lowercase hex (Web Crypto). Compute BEFORE opening a Dexie transaction. */
export async function sha256Hex(
  data: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Custom scheme used to serve local thumbnail/preview files to the renderer
 * without the CORS/canvas-taint issues of raw file:// URLs. */
export const ASSET_SCHEME = 'pcs-asset'

export function toAssetUrl(absolutePath: string): string {
  return `${ASSET_SCHEME}://local/${encodeURIComponent(absolutePath)}`
}

export function fromAssetUrl(url: string): string {
  const prefix = `${ASSET_SCHEME}://local/`
  return decodeURIComponent(url.slice(prefix.length))
}

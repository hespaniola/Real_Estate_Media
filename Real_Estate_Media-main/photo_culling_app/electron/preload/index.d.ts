import type { PhotoCullingApi } from './index'

declare global {
  interface Window {
    api: PhotoCullingApi
  }
}

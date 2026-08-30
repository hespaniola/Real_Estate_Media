// Copies the MediaPipe WASM runtime (from node_modules, generated at install
// time) and the bundled face-detector model into src/renderer/public so Vite
// serves them as plain static assets — no runtime network fetch required.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = path.join(root, 'src/renderer/public/mediapipe/wasm')

const modelSrc = path.join(root, 'resources/models/blaze_face_short_range.tflite')
const modelDestDir = path.join(root, 'src/renderer/public/mediapipe/models')
const modelDest = path.join(modelDestDir, 'blaze_face_short_range.tflite')

if (!existsSync(wasmSrc)) {
  console.warn(`[copy-mediapipe-assets] WASM source not found at ${wasmSrc}, skipping.`)
} else {
  mkdirSync(wasmDest, { recursive: true })
  cpSync(wasmSrc, wasmDest, { recursive: true })
  console.log(`[copy-mediapipe-assets] copied WASM runtime -> ${path.relative(root, wasmDest)}`)
}

if (!existsSync(modelSrc)) {
  console.warn(`[copy-mediapipe-assets] Model source not found at ${modelSrc}, skipping.`)
} else {
  mkdirSync(modelDestDir, { recursive: true })
  cpSync(modelSrc, modelDest)
  console.log(`[copy-mediapipe-assets] copied face model -> ${path.relative(root, modelDest)}`)
}

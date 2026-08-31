// One-off manual verification helper (not part of the shipped app): boots a
// minimal window pointed at the real preload + built renderer, waits for
// load, and saves a screenshot so we can visually sanity-check the UI in an
// environment with no interactive display attached.
import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ASSET_SCHEME = 'pcs-asset'

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(async () => {
  protocol.handle(ASSET_SCHEME, (request) => {
    const filePath = decodeURIComponent(request.url.replace(`${ASSET_SCHEME}://local/`, ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    webPreferences: {
      preload: path.join(root, 'out/preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer L${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.log('[preload-error]', preloadPath, error)
  })

  await win.loadFile(path.join(root, 'out/renderer/index.html'))
  await new Promise((r) => setTimeout(r, 2000))

  const image = await win.webContents.capturePage()
  const outPath = path.join(root, 'scratch-screenshot.png')
  await writeFile(outPath, image.toPNG())
  console.log('WROTE_SCREENSHOT', outPath)

  app.quit()
})

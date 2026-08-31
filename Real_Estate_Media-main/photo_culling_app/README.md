# Photo Culling Studio

A desktop photo culling app for photographers. Drag in a folder of hundreds of RAW/JPEG photos and it analyzes sharpness, exposure, composition, faces, and near-duplicates; groups similar shots together and recommends the strongest frame in each group; and scores every image 1–100 so you can accept, reject, or favorite quickly with the keyboard.

Built with Electron + React + TypeScript. No cloud services, no uploads — everything runs locally.

## Running it

```bash
npm install       # also copies the MediaPipe WASM runtime + face model into src/renderer/public
npm run dev        # launches the app with hot reload
```

```bash
npm run build       # type-checks and bundles main/preload/renderer into out/
npm run typecheck   # tsc --noEmit over both the Node and web halves
npm run test:analysis     # unit-checks the sharpness/exposure/composition/hash/RAW math against synthetic images
npm run test:integration  # runs the real scanner -> worker pool -> clustering pipeline end-to-end (RAW + a real HEIC fixture)
npm run test:store        # regression check for filter behavior on failed/errored photos
npm run dist         # electron-builder installer (mac/win/linux) — not exercised in CI, sanity-check locally before shipping
```

## How it works

**Import.** Drag a folder onto the window (or use "Choose Folder"). The app recursively scans it for RAW, HEIC/HEIF, and JPEG/TIFF/PNG/WebP files. Video files (.mov, .mp4, .hevc, etc.) are intentionally skipped — this is a photo culler, not a video one.

**Analysis (`electron/main`).** Each file is handed to a pool of `worker_threads` (sized to CPU count) so hundreds of photos process in parallel without blocking the UI:

- **RAW preview.** Rather than a format-specific RAW decoder, `rawPreview.ts` scans the file's raw bytes for embedded JPEG `SOI...EOI` streams (every mainstream RAW format — CR2/CR3, NEF, ARW, RAF, RW2, ORF, DNG… — carries one for fast preview) and keeps the largest one that actually decodes, falling back through smaller candidates (and finally the EXIF thumbnail) since the largest matching byte span isn't always a real, decodable JPEG. This is the same trick fast RAW browsers use, and it's format-agnostic instead of needing a parser per vendor.
- **HEIC/HEIF preview.** sharp's prebuilt libvips bundles libheif's AVIF (AV1) decode path but not the HEVC one iPhone-format `.heic` photos actually use (HEVC's patent licensing keeps it out of the prebuilt binaries) — `sharp(file)` fails outright on them. These are decoded to JPEG first via `heic-convert` (a WASM libheif build), then handed to the same sharp pipeline as everything else. EXIF for HEIC is parsed from that same in-memory buffer rather than the file path — exifr's HEIC box reader has a bug on some real files where it throws from a detached background read outside its own awaited promise, which no try/catch around the call site catches; reading it from a buffer avoids exifr's file I/O path entirely. As defense in depth, each worker also installs a top-level `uncaughtException`/`unhandledRejection` handler that fails just the in-flight task instead of letting a surprise from any library silently kill the worker and strand everything still queued behind it.
- **Sharpness.** A Laplacian convolution over a 1024px-downsampled greyscale frame; the pixel-wise variance of the response is mapped through a diminishing-returns curve to a 0–100 score.
- **Exposure.** Mean brightness and contrast (stdev) scored against a well-exposed target range, with shadow/highlight clipping percentages subtracted as a direct penalty.
- **Composition.** A Sobel gradient magnitude map stands in for saliency. Where that energy's centroid falls relative to the four rule-of-thirds intersections drives the composition score; a secondary pass looks for a dominant near-horizontal edge (a horizon or architectural line) and penalizes it if tilted.
- **Duplicates/similar.** A 64-bit difference hash (dHash) per image, clustered by Hamming distance with a union-find — no ML, runs in milliseconds even at a few thousand photos.
- **Thumbnails/EXIF.** A 640px grid thumbnail and a 1920px loupe preview are cached to disk, alongside camera/lens/exposure metadata pulled via `exifr`.

**Faces (renderer).** Face detection needs a browser/WebGL-ish context, so it runs in the renderer (which is just Chromium) using `@mediapipe/tasks-vision`'s WASM face detector, pointed at a model file bundled locally under `resources/models/` — no network call at runtime. It runs as a low-priority background queue over the grid thumbnails once the initial scan completes, and reports back per-image so the score updates live. A photo with faces is scored on face sharpness, size/prominence, and framing; a photo with **no** faces — an empty room, a landscape — simply excludes that dimension rather than being marked down for "no face."

**Scoring.** `electron/shared/scoring.ts` combines the four dimensions with fixed weights (sharpness 35%, exposure 25%, composition 15%, faces 25% when applicable — the faces weight is redistributed across the others when there's no face to judge). Being the non-recommended member of a duplicate group applies a small additional penalty so the group's real pick naturally sorts to the top.

**Caching.** Each source folder gets a `.photo-culling-cache/` directory (thumbnails, previews, analysis results, and your accept/reject/favorite flags). Reopening the same folder skips reprocessing anything whose size/mtime hasn't changed and restores your flags — safe to re-run on a folder you're still culling.

**Local asset serving.** Thumbnails/previews are served to the renderer over a custom `pcs-asset://` scheme (registered as a privileged, CORS-enabled scheme) rather than raw `file://` URLs, so MediaPipe's canvas/WebGL pixel access isn't blocked by cross-origin tainting.

## UI

Dark, high-contrast, minimal — big previews and a numeric score front and center, everything else a click or keypress away.

- **Grid** — every photo with its score badge, group/pick badge, and RAW indicator; flag buttons appear on hover.
- **Inspector** (right sidebar) — the selected photo's preview plus its full metric breakdown and EXIF.
- **Loupe** (space/enter) — full-screen view with face boxes overlaid, previous/next navigation, and the same metrics panel.
- **Filters** — All / Picks / Accepted / Favorites / Rejected / Unflagged; sort by score, name, date, or group.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Previous / next photo |
| `Space` / `Enter` | Open the full-screen loupe |
| `Esc` | Close the loupe |
| `A` | Accept |
| `X` | Reject |
| `F` | Favorite |
| `U` | Clear flag |

## Project layout

```
electron/
  main/       scanning, worker pool, RAW preview extraction, pixel analysis, duplicate clustering, IPC
  preload/    contextBridge API exposed to the renderer
  shared/     types + the pure scoring/hashing functions used by both main and the renderer
src/renderer/ React UI (Vite)
resources/models/  bundled MediaPipe face-detector model (copied into the renderer build at install/dev/build time)
scripts/      copy-mediapipe-assets, the test scripts above, and fixtures/ (a real HEIC test file)
```

## Notes / limitations

- Tested headlessly (typecheck, unit tests, an end-to-end synthetic-shoot integration test, and an offscreen boot+screenshot check) in a sandboxed environment with no attached display — worth a quick manual pass on your own machine before relying on it for a real shoot, especially drag-and-drop and the full RAW/EXIF path against your camera's actual files.
- The composition/exposure heuristics are deliberately non-ML (fast, offline, no training data needed) — they're a strong sharpness/exposure/framing signal, not a substitute for your eye on genuinely close calls.
- `npm run dist` (installer packaging) is configured but not exercised here — sanity-check a built installer locally before distributing one.

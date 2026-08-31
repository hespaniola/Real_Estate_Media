// End-to-end smoke test of the real scanning pipeline (scanner + cache +
// worker pool + duplicate clustering + scoring) against a synthetic shoot
// folder, without needing the Electron GUI. Run: node scripts/test-integration.mjs
import sharp from 'sharp'
import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { discoverImages } from '../electron/main/scanner.ts'
import { ensureCacheDirs, JsonMapStore } from '../electron/main/cache.ts'
import { ImageWorkerPool } from '../electron/main/workerPool.ts'
import { clusterSimilarImages } from '../electron/main/duplicates.ts'
import { computeCompositeScore } from '../electron/shared/scoring.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const shootDir = path.join(root, 'scratch-shoot')

async function makePhoto(filePath, opts) {
  const { w = 1200, h = 800, blur = 0, brightness = 128, subjectX = 0.5, subjectY = 0.5, seed = 0, pattern = 'circle' } = opts
  const rects = Array.from({ length: 12 })
    .map((_, i) => {
      const x = ((i * 97 + seed * 13) % w)
      const y = ((i * 61 + seed * 7) % h)
      return `<rect x="${x}" y="${y}" width="10" height="10" fill="#${i % 2 ? 'fff' : '000'}"/>`
    })
    .join('')
  const bg = Math.max(0, Math.min(255, brightness))
  // 'circle' = a burst-like frame (centered subject on flat background);
  // 'split' = a structurally different frame (diagonal light/dark split),
  // so unrelated shots produce a genuinely different coarse gradient hash
  // instead of just a repositioned dot on the same flat background.
  const subject =
    pattern === 'split'
      ? `<polygon points="0,0 ${w},0 0,${h}" fill="#101010"/><polygon points="${w},0 ${w},${h} 0,${h}" fill="#e8e8e8"/>`
      : pattern === 'grid'
        ? Array.from({ length: 6 })
            .map((_, i) => `<rect x="${(i * w) / 6}" y="0" width="${w / 12}" height="${h}" fill="#151515"/>`)
            .join('')
        : `<circle cx="${subjectX * w}" cy="${subjectY * h}" r="${Math.min(w, h) * 0.15}" fill="#333"/>`
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}">` +
      `<rect width="100%" height="100%" fill="rgb(${bg},${bg},${bg})"/>` +
      subject +
      rects +
      `</svg>`
  )
  let pipeline = sharp(svg).jpeg({ quality: 92 })
  if (blur > 0) pipeline = sharp(svg).blur(blur).jpeg({ quality: 92 })
  await pipeline.toFile(filePath)
}

async function makeFakeRaw(filePath, jpegBuffer) {
  const wrapped = Buffer.concat([
    Buffer.from('FAKE_CAMERA_RAW_CONTAINER_HEADER_'.repeat(30)),
    jpegBuffer,
    Buffer.from('TRAILING_MAKER_NOTE_DATA'.repeat(10))
  ])
  await writeFile(filePath, wrapped)
}

async function main() {
  await rm(shootDir, { recursive: true, force: true })
  await mkdir(shootDir, { recursive: true })

  console.log(`Building synthetic shoot in ${shootDir}`)
  await makePhoto(path.join(shootDir, 'burst_a_sharp.jpg'), { seed: 1, brightness: 140 })
  await makePhoto(path.join(shootDir, 'burst_a_blurry.jpg'), { seed: 1, brightness: 140, blur: 10 })
  await makePhoto(path.join(shootDir, 'burst_a_dupe.jpg'), { seed: 1, brightness: 142 })
  await makePhoto(path.join(shootDir, 'unrelated_shot.jpg'), { seed: 99, brightness: 90, pattern: 'split' })
  await makePhoto(path.join(shootDir, 'dark_underexposed.jpg'), { seed: 55, brightness: 15 })

  const previewJpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#446688' } })
    .jpeg()
    .toBuffer()
  await makeFakeRaw(path.join(shootDir, 'landscape.cr2'), previewJpeg)

  // A RAW file whose LARGEST "SOI...EOI"-shaped byte span is pure garbage
  // (mimicking maker-note/sensor data that coincidentally contains those
  // marker bytes) sitting before a smaller but genuinely decodable preview.
  // The extractor must fall through to the real one instead of failing.
  const fallbackPreview = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#886644' } })
    .jpeg()
    .toBuffer()
  const bogusSpan = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    crypto.randomBytes(20 * 1024),
    Buffer.from([0xff, 0xd9])
  ])
  await writeFile(
    path.join(shootDir, 'raw_with_bogus_span.cr2'),
    Buffer.concat([
      Buffer.from('HEADER_'.repeat(20)),
      bogusSpan,
      Buffer.from('MAKER_NOTE_'.repeat(20)),
      fallbackPreview,
      Buffer.from('TRAILER_'.repeat(20))
    ])
  )

  await mkdir(path.join(shootDir, 'subfolder'), { recursive: true })
  await makePhoto(path.join(shootDir, 'subfolder', 'nested_shot.jpg'), { seed: 7, brightness: 180, pattern: 'grid' })

  // A real iPhone-style HEIC photo — the format sharp's prebuilt libvips
  // cannot decode directly (see imageWorker.ts's 'heif' branch).
  await copyFile(path.join(root, 'scripts/fixtures/sample.heic'), path.join(shootDir, 'iphone_photo.heic'))

  console.log('\nDiscovering images...')
  const files = await discoverImages(shootDir)
  console.log(`  found ${files.length} files`)
  assert.equal(files.length, 9, `expected 9 discovered files, got ${files.length}`)
  assert.ok(files.some((f) => f.kind === 'raw'), 'expected at least one RAW file discovered')
  assert.ok(files.some((f) => f.kind === 'heif'), 'expected the HEIC file discovered')
  assert.ok(
    files.some((f) => f.filePath.includes('subfolder')),
    'expected recursive discovery into subfolder'
  )
  console.log('  ok  - discovery finds all files, including RAW and nested subfolder')

  console.log('\nRunning worker pool over all files...')
  const cachePaths = await ensureCacheDirs(shootDir)
  const analysisStore = new JsonMapStore(cachePaths.analysisFile)
  await analysisStore.ready()
  // Use the real built worker artifact (out/main/imageWorker.js) so this test
  // exercises exactly what the packaged app runs — `npm run build` first.
  const pool = new ImageWorkerPool(path.join(root, 'out/main/imageWorker.js'), 3)

  const results = []
  for (const file of files) {
    const name = path.basename(file.filePath).replace(/[^a-z0-9]/gi, '_')
    const thumbPath = path.join(cachePaths.thumbsDir, `${name}.jpg`)
    const previewPath = path.join(cachePaths.previewsDir, `${name}.jpg`)
    const result = await pool.run({ filePath: file.filePath, kind: file.kind, thumbPath, previewPath })
    results.push({ file, result })
  }
  pool.destroy()

  const failed = results.filter((r) => !r.result.ok)
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAIL processing ${f.file.filePath}: ${f.result.error}`)
  }
  assert.equal(failed.length, 0, `expected all files to process successfully, ${failed.length} failed`)
  console.log(`  ok  - all ${results.length} files processed without error`)

  for (const { result } of results) {
    assert.ok(result.width > 0 && result.height > 0, 'expected positive decoded dimensions')
  }
  console.log('  ok  - every result has positive width/height')

  const rawResult = results.find((r) => r.file.fileName === 'landscape.cr2')
  assert.ok(rawResult, 'expected a raw result')
  assert.equal(rawResult.result.width, 2400)
  assert.equal(rawResult.result.height, 1600)
  console.log('  ok  - RAW file preview extracted at correct embedded-JPEG resolution (2400x1600)')

  const bogusSpanResult = results.find((r) => r.file.fileName === 'raw_with_bogus_span.cr2')
  assert.ok(bogusSpanResult, 'expected the bogus-span raw result')
  assert.equal(bogusSpanResult.result.ok, true, `expected fallback to succeed, got: ${bogusSpanResult.result.error}`)
  assert.equal(bogusSpanResult.result.width, 1800)
  assert.equal(bogusSpanResult.result.height, 1200)
  console.log('  ok  - a larger non-decodable byte span is skipped in favor of the real, smaller, decodable preview')

  const heicResult = results.find((r) => r.file.fileName === 'iphone_photo.heic')
  assert.ok(heicResult, 'expected the HEIC result')
  assert.equal(heicResult.result.ok, true, `expected HEIC decode to succeed, got: ${heicResult.result.error}`)
  assert.equal(heicResult.result.width, 1280)
  assert.equal(heicResult.result.height, 854)
  console.log('  ok  - a real HEIC (iPhone-format) photo decodes correctly via the heic-convert fallback')

  console.log('\nScoring + duplicate clustering...')
  const scored = results.map(({ file, result }) => ({
    id: file.filePath,
    hash: result.ok ? result.hash : null,
    fileName: file.fileName,
    width: result.ok ? result.width : 0,
    height: result.ok ? result.height : 0,
    sharpness: result.ok ? result.sharpness.score : 0,
    score: computeCompositeScore({
      sharpness: result.sharpness.score,
      exposure: result.exposure.score,
      composition: result.composition.score,
      faces: { score: 0, analyzed: false, count: 0 },
      isDuplicateNonPick: false
    }).total
  }))

  for (const s of scored) console.log(`  ${s.fileName.padEnd(28)} score=${String(s.score).padStart(3)}`)

  const sharpOne = scored.find((s) => s.fileName === 'burst_a_sharp.jpg')
  const blurryOne = scored.find((s) => s.fileName === 'burst_a_blurry.jpg')
  assert.ok(sharpOne.score > blurryOne.score, 'sharp burst frame should outscore the blurry one')
  console.log('  ok  - sharp burst frame outscores its blurry twin')

  const darkOne = scored.find((s) => s.fileName === 'dark_underexposed.jpg')
  const wellExposed = scored.find((s) => s.fileName === 'unrelated_shot.jpg')
  assert.ok(wellExposed.score > darkOne.score, 'well-exposed shot should outscore underexposed one')
  console.log('  ok  - well-exposed shot outscores underexposed one')

  const groups = clusterSimilarImages(scored)
  console.log(`\n  found ${groups.length} duplicate/similar group(s)`)
  for (const g of groups) {
    const names = g.memberIds.map((id) => path.basename(id))
    const pickName = path.basename(g.recommendedId)
    console.log(`    group: [${names.join(', ')}] -> pick: ${pickName}`)
  }
  assert.ok(groups.length >= 1, 'expected at least one duplicate group among the burst_a_* frames')
  const burstGroup = groups.find((g) => g.memberIds.some((id) => id.includes('burst_a_sharp')))
  assert.ok(burstGroup, 'expected burst_a_sharp to be clustered into a group')
  assert.ok(
    burstGroup.memberIds.some((id) => id.includes('burst_a_blurry')) &&
      burstGroup.memberIds.some((id) => id.includes('burst_a_dupe')),
    'expected all three burst_a_* frames in the same group'
  )
  assert.ok(
    !burstGroup.recommendedId.includes('burst_a_blurry'),
    'expected the visibly blurry frame to lose the recommendation to one of its sharp twins'
  )
  assert.ok(
    !groups.some((g) => g.memberIds.some((id) => id.includes('unrelated_shot'))),
    'unrelated_shot should not be clustered with the burst'
  )
  console.log('  ok  - burst frames cluster together and the sharp frame is the recommended pick')
  console.log('  ok  - the unrelated shot is correctly excluded from that group')

  await analysisStore.flush()
  console.log('\nAll integration checks passed.')
}

main()
  .catch((err) => {
    console.error('\nIntegration test FAILED:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await rm(shootDir, { recursive: true, force: true })
  })

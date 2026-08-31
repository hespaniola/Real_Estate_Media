// Exercises the core analysis pipeline against synthetically generated
// images so the sharpness/exposure/composition/hash/RAW-preview logic is
// verified end-to-end without needing real camera files on disk.
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { computeExposure, computeComposition, computeDHash, computeSharpness } from '../electron/main/imageAnalysis.ts'
import { extractLargestEmbeddedJpeg } from '../electron/main/rawPreview.ts'
import { computeCompositeScore, hammingDistanceHex } from '../electron/shared/scoring.ts'

const SIZE = 512
let failures = 0

function check(name, fn) {
  try {
    fn()
    console.log(`  ok  - ${name}`)
  } catch (err) {
    failures++
    console.log(`FAIL  - ${name}`)
    console.log(`        ${err.message}`)
  }
}

async function raw(pipeline) {
  return pipeline.raw().toBuffer({ resolveWithObject: true })
}

async function main() {
  console.log('Sharpness: tack-sharp vs. blurred noise pattern')
  const noiseSvg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}">${Array.from({ length: 40 })
      .map(
        (_, i) =>
          `<rect x="${(i * 37) % SIZE}" y="${(i * 53) % SIZE}" width="6" height="${SIZE}" fill="#${
            i % 2 ? 'fff' : '000'
          }"/>`
      )
      .join('')}</svg>`
  )
  const laplacianKernel = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }
  async function sharpnessOf(pipeline) {
    const lum = await raw(pipeline.greyscale())
    const lap = await raw(
      sharp(lum.data, { raw: { width: lum.info.width, height: lum.info.height, channels: 1 } }).convolve(
        laplacianKernel
      )
    )
    return computeSharpness({ data: lap.data, width: lap.info.width, height: lap.info.height })
  }
  const sharpResult = await sharpnessOf(sharp(noiseSvg).resize(SIZE, SIZE))
  const blurredResult = await sharpnessOf(sharp(noiseSvg).resize(SIZE, SIZE).blur(12))
  const sharpScore = sharpResult.score
  const blurredScore = blurredResult.score
  console.log(`        sharp=${sharpScore.toFixed(1)} blurred=${blurredScore.toFixed(1)}`)

  check('sharp image scores meaningfully higher than blurred', () => {
    assert.ok(sharpScore > blurredScore + 20, `${sharpScore} should exceed ${blurredScore}+20`)
  })

  console.log('\nExposure: well-exposed mid-grey vs. blown-out white')
  const midGrey = await raw(
    sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 130, g: 130, b: 130 } } }).greyscale()
  )
  const blownOut = await raw(
    sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 255, b: 255 } } }).greyscale()
  )
  const midExposure = computeExposure({ data: midGrey.data, width: 64, height: 64 })
  const blownExposure = computeExposure({ data: blownOut.data, width: 64, height: 64 })
  console.log(`        mid-grey=${midExposure.score.toFixed(1)} blown-out=${blownExposure.score.toFixed(1)}`)

  check('well-exposed mid-grey scores higher than fully blown-out', () => {
    assert.ok(midExposure.score > blownExposure.score)
  })
  check('blown-out frame reports ~100% highlight clipping', () => {
    assert.ok(blownExposure.highlightClipPct > 95)
  })

  console.log('\nComposition: off-center subject vs. dead-center subject')
  async function gradientPair(cx, cy) {
    const svg = Buffer.from(
      `<svg width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="#808080"/><circle cx="${
        cx * SIZE
      }" cy="${cy * SIZE}" r="60" fill="#000"/></svg>`
    )
    const grey = await raw(sharp(svg).resize(SIZE, SIZE).greyscale())
    const gx = await raw(
      sharp(grey.data, { raw: { width: grey.info.width, height: grey.info.height, channels: 1 } }).convolve({
        width: 3,
        height: 3,
        kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
        offset: 128
      })
    )
    const gy = await raw(
      sharp(grey.data, { raw: { width: grey.info.width, height: grey.info.height, channels: 1 } }).convolve({
        width: 3,
        height: 3,
        kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
        offset: 128
      })
    )
    return computeComposition(
      { data: gx.data, width: gx.info.width, height: gx.info.height },
      { data: gy.data, width: gy.info.width, height: gy.info.height }
    )
  }

  const thirdsComposition = await gradientPair(1 / 3, 1 / 3)
  const centerComposition = await gradientPair(0.5, 0.5)
  console.log(
    `        rule-of-thirds subject=${thirdsComposition.ruleOfThirdsStrength.toFixed(
      1
    )} centered subject=${centerComposition.ruleOfThirdsStrength.toFixed(1)}`
  )
  check('subject on a power point scores higher rule-of-thirds strength', () => {
    assert.ok(thirdsComposition.ruleOfThirdsStrength > centerComposition.ruleOfThirdsStrength)
  })

  console.log('\nPerceptual hash: identical vs. near-identical vs. very different')
  async function dhashOf(svg) {
    const buf = await raw(sharp(Buffer.from(svg)).resize(9, 8, { fit: 'fill' }).greyscale())
    return computeDHash({ data: buf.data, width: 9, height: 8 })
  }
  const imgA = `<svg width="200" height="200"><rect width="100%" height="100%" fill="#fff"/><circle cx="100" cy="100" r="70" fill="#111"/></svg>`
  const imgANearDup = `<svg width="200" height="200"><rect width="100%" height="100%" fill="#fefefe"/><circle cx="102" cy="100" r="70" fill="#131313"/></svg>`
  const imgBDifferent = `<svg width="200" height="200"><rect width="100%" height="100%" fill="#000"/><rect x="0" y="0" width="80" height="200" fill="#fff"/></svg>`

  const hashA = await dhashOf(imgA)
  const hashNearDup = await dhashOf(imgANearDup)
  const hashDifferent = await dhashOf(imgBDifferent)
  const distNear = hammingDistanceHex(hashA, hashNearDup)
  const distFar = hammingDistanceHex(hashA, hashDifferent)
  console.log(`        near-duplicate distance=${distNear} very-different distance=${distFar}`)

  check('near-identical frames hash much closer than very different ones', () => {
    assert.ok(distNear < distFar)
    assert.ok(distNear <= 12, `expected near-duplicate distance <=12, got ${distNear}`)
  })

  console.log('\nRAW preview extraction: pick the largest embedded JPEG')
  const smallJpeg = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#123456' } })
    .jpeg()
    .toBuffer()
  const largeJpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#654321' } })
    .jpeg()
    .toBuffer()
  const fakeRaw = Buffer.concat([
    Buffer.from('FAKE_RAW_HEADER_GARBAGE_BYTES_'.repeat(20)),
    smallJpeg,
    Buffer.from('MORE_MAKER_NOTE_GARBAGE_'.repeat(20)),
    largeJpeg,
    Buffer.from('TRAILING_GARBAGE'.repeat(10))
  ])
  const extracted = extractLargestEmbeddedJpeg(fakeRaw)
  check('extracted buffer is present and decodable', () => {
    assert.ok(extracted, 'expected a non-null extracted buffer')
  })
  const meta = await sharp(extracted).metadata()
  console.log(`        extracted preview: ${meta.width}x${meta.height} (expected 1600x1200, the larger one)`)
  check('largest embedded JPEG (not the small thumbnail) is chosen', () => {
    assert.equal(meta.width, 1600)
    assert.equal(meta.height, 1200)
  })

  console.log('\nComposite scoring: sanity checks')
  const strongScore = computeCompositeScore({
    sharpness: 95,
    exposure: 90,
    composition: 85,
    faces: { score: 0, analyzed: false, count: 0 },
    isDuplicateNonPick: false
  })
  const weakScore = computeCompositeScore({
    sharpness: 10,
    exposure: 20,
    composition: 15,
    faces: { score: 0, analyzed: false, count: 0 },
    isDuplicateNonPick: false
  })
  const dupPenalized = computeCompositeScore({
    sharpness: 95,
    exposure: 90,
    composition: 85,
    faces: { score: 0, analyzed: false, count: 0 },
    isDuplicateNonPick: true
  })
  console.log(
    `        strong=${strongScore.total} weak=${weakScore.total} strong-but-non-pick-duplicate=${dupPenalized.total}`
  )
  check('a strong photo without face data omits the faces dimension (null)', () => {
    assert.equal(strongScore.faces, null)
  })
  check('strong photo scores much higher than a weak one', () => {
    assert.ok(strongScore.total > weakScore.total + 40)
  })
  check('non-recommended duplicate is penalized relative to the same photo as a pick', () => {
    assert.ok(dupPenalized.total < strongScore.total)
  })
  check('scores always stay within 1-100', () => {
    for (const s of [strongScore, weakScore, dupPenalized]) {
      assert.ok(s.total >= 1 && s.total <= 100, `total ${s.total} out of range`)
    }
  })

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Test script crashed:', err)
  process.exit(1)
})

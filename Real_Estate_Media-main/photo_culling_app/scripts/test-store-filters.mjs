// Regression check for the "blank grid when every photo fails to analyze"
// bug: error-status records must still be visible under 'all'/'failed',
// and must never satisfy a judgment filter (accepted/favorite/etc) meant
// for successfully analyzed photos.
import assert from 'node:assert/strict'
import { passesFilter } from '../src/renderer/src/store.ts'

function baseRecord(overrides) {
  return {
    id: 'x',
    filePath: '/tmp/x.jpg',
    fileName: 'x.jpg',
    dirPath: '/tmp',
    kind: 'jpeg',
    ext: '.jpg',
    size: 100,
    mtimeMs: 0,
    thumbPath: null,
    previewPath: null,
    width: 0,
    height: 0,
    status: 'ready',
    exif: {},
    sharpness: null,
    exposure: null,
    composition: null,
    faces: null,
    hash: null,
    groupId: null,
    isRecommended: false,
    score: null,
    flag: 'none',
    ...overrides
  }
}

const errored = baseRecord({ status: 'error', error: 'boom' })
const ready = baseRecord({ status: 'ready', score: { total: 80, sharpness: 80, exposure: 80, composition: 80, faces: null, duplicatePenalty: 0 } })

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  - ${name}`)
  } catch (err) {
    failures++
    console.log(`FAIL  - ${name}\n        ${err.message}`)
  }
}

check("an errored photo is visible under 'all'", () => assert.equal(passesFilter(errored, 'all'), true))
check("an errored photo is visible under 'failed'", () => assert.equal(passesFilter(errored, 'failed'), true))
check("a ready photo is NOT shown under 'failed'", () => assert.equal(passesFilter(ready, 'failed'), false))
for (const f of ['unflagged', 'accepted', 'rejected', 'favorite', 'recommended']) {
  check(`an errored photo never passes the '${f}' filter`, () => assert.equal(passesFilter(errored, f), false))
}
check("a ready, unflagged photo still passes 'unflagged'", () => assert.equal(passesFilter(ready, 'unflagged'), true))

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`)
process.exit(failures === 0 ? 0 : 1)

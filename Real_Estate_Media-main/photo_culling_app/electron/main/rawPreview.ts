/**
 * Format-agnostic embedded-JPEG extraction for camera RAW files.
 *
 * Every mainstream RAW container (CR2/CR3, NEF, ARW, RAF, RW2, ORF, DNG, PEF...)
 * embeds one or more standard baseline JPEG streams for fast preview purposes,
 * regardless of the surrounding TIFF/ISO-BMFF container format. Rather than
 * writing a parser per vendor format, we scan the raw bytes for JPEG
 * SOI...EOI (0xFFD8...0xFFD9) segments and keep the largest one — this is
 * the same trick fast RAW browsers use under the hood, and it degrades
 * gracefully (returns null) for anything unrecognized.
 */

interface JpegSegment {
  start: number
  end: number // exclusive
}

const SOI = Buffer.from([0xff, 0xd8, 0xff])
const EOI = Buffer.from([0xff, 0xd9])
const MIN_SEGMENT_BYTES = 4 * 1024

export function findEmbeddedJpegSegments(buffer: Buffer): JpegSegment[] {
  const segments: JpegSegment[] = []
  let cursor = 0
  while (cursor < buffer.length) {
    const start = buffer.indexOf(SOI, cursor)
    if (start === -1) break
    const end = buffer.indexOf(EOI, start + SOI.length)
    if (end === -1) break
    const segmentEnd = end + EOI.length
    if (segmentEnd - start >= MIN_SEGMENT_BYTES) {
      segments.push({ start, end: segmentEnd })
    }
    cursor = segmentEnd
  }
  return segments
}

/**
 * All embedded JPEG-shaped byte spans, largest first. A byte pattern that
 * merely *looks* like a JPEG (an SOI...EOI span landing inside maker-note or
 * other binary metadata) doesn't always decode — callers should try each
 * candidate in order and fall back to the next one if a given span fails to
 * decode, rather than trusting the largest span outright.
 */
export function extractEmbeddedJpegCandidates(buffer: Buffer): Buffer[] {
  const segments = findEmbeddedJpegSegments(buffer)
  segments.sort((a, b) => (b.end - b.start) - (a.end - a.start))
  return segments.map((seg) => buffer.subarray(seg.start, seg.end))
}

/** Returns the byte range of the largest embedded JPEG stream, or null. */
export function extractLargestEmbeddedJpeg(buffer: Buffer): Buffer | null {
  const candidates = extractEmbeddedJpegCandidates(buffer)
  return candidates[0] ?? null
}

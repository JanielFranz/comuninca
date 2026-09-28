/**
 * Client-side event-picture pipeline (feature #16).
 *
 * Validate -> decode -> cover-crop to a fixed 960x540 -> encode as JPEG,
 * stepping the quality down to fit a byte budget -> base64 data URL.
 *
 * This module is browser-safe: no Node-only APIs, no Prisma/Supabase import
 * (only the server action in `lib/actions/events.ts` uploads). It is also
 * structured so the DECISION logic (type/size validation, the cover-crop
 * math, the quality-stepping loop) is plain, DOM-free and unit-testable,
 * separate from the DOM-dependent steps (`createImageBitmap`, `<canvas>`,
 * `FileReader`) that Vitest's default (Node) environment does not provide.
 */
import { STRINGS } from "./strings"

/** Fixed output size (16:9), per the form's design (never stretched). */
export const PICTURE_OUTPUT_WIDTH = 960
export const PICTURE_OUTPUT_HEIGHT = 540
export const PICTURE_OUTPUT_MIME = "image/jpeg"

/** Reject anything larger before ever attempting to decode it. */
export const PICTURE_MAX_INPUT_BYTES = 8 * 1024 * 1024 // 8 MB
/** Byte budget the encoder tries to stay under after resizing. */
export const PICTURE_MAX_OUTPUT_BYTES = 500 * 1024 // 500 KB
export const PICTURE_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const
/** Quality steps tried in order until the output fits the byte budget. */
export const PICTURE_QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4] as const

export type PictureRejectReason =
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "DECODE_FAILED"
  | "COMPRESSION_FAILED"

export type PictureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: PictureRejectReason }

/** es-PE copy for a picture pipeline failure, for inline display. */
export function pictureErrorMessage(reason: PictureRejectReason): string {
  const t = STRINGS.addEventModal.errors
  switch (reason) {
    case "UNSUPPORTED_TYPE":
      return t.pictureUnsupportedType
    case "FILE_TOO_LARGE":
      return t.pictureTooLarge
    case "DECODE_FAILED":
      return t.pictureDecodeFailed
    case "COMPRESSION_FAILED":
      return t.pictureCompressionFailed
  }
}

/**
 * Pure: type/size check, before any decode is attempted (a huge or
 * malicious file must not even reach the decoder).
 */
export function validatePictureFile(file: {
  type: string
  size: number
}): { ok: true } | { ok: false; error: PictureRejectReason } {
  if (!(PICTURE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "UNSUPPORTED_TYPE" }
  }
  if (file.size <= 0 || file.size > PICTURE_MAX_INPUT_BYTES) {
    return { ok: false, error: "FILE_TOO_LARGE" }
  }
  return { ok: true }
}

export interface CoverCrop {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * Pure: the centered source-pixel rectangle to crop before scaling to the
 * fixed target size, so the result is exactly `targetWidth x targetHeight`
 * with no stretching/distortion (crop, then scale).
 */
export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number = PICTURE_OUTPUT_WIDTH,
  targetHeight: number = PICTURE_OUTPUT_HEIGHT,
): CoverCrop {
  const targetRatio = targetWidth / targetHeight
  const sourceRatio = sourceWidth / sourceHeight
  if (sourceRatio > targetRatio) {
    // Source is relatively wider than the target: crop the left/right edges.
    const sw = sourceHeight * targetRatio
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight }
  }
  // Source is relatively taller than (or equal to) the target: crop top/bottom.
  const sh = sourceWidth / targetRatio
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh }
}

/**
 * Pure decision logic: tries each quality step in order against an
 * INJECTED encoder (real Canvas encoding in the browser; a fake one in
 * tests) and returns the first result at or under the byte budget, or
 * `COMPRESSION_FAILED` once every step has been tried. Kept independent of
 * Canvas so the stepping behaviour is directly unit-testable.
 */
export async function encodeWithBudget<T extends { size: number }>(
  encodeAtQuality: (quality: number) => Promise<T>,
  qualities: readonly number[] = PICTURE_QUALITY_STEPS,
  maxBytes: number = PICTURE_MAX_OUTPUT_BYTES,
): Promise<
  | { ok: true; result: T; quality: number }
  | { ok: false; error: "COMPRESSION_FAILED" }
> {
  for (const quality of qualities) {
    const result = await encodeAtQuality(quality)
    if (result.size <= maxBytes) return { ok: true, result, quality }
  }
  return { ok: false, error: "COMPRESSION_FAILED" }
}

// ---------------------------------------------------------------------------
// DOM-dependent steps below. NOT unit-testable under Vitest's default (Node)
// environment: `createImageBitmap`, `<canvas>`, `Image` and `FileReader` do
// not exist there, and this project has no jsdom/browser test environment
// configured (see progress/history.md — every prior feature notes the same
// gap for component/DOM code). The pure functions above cover everything
// that CAN be tested without a browser; this section is exercised by manual
// browser verification only.
// ---------------------------------------------------------------------------

interface DecodedImage {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, crop: CoverCrop) => void
  dispose: () => void
}

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, crop) => {
        ctx.drawImage(
          bitmap,
          crop.sx,
          crop.sy,
          crop.sw,
          crop.sh,
          0,
          0,
          PICTURE_OUTPUT_WIDTH,
          PICTURE_OUTPUT_HEIGHT,
        )
      },
      dispose: () => bitmap.close(),
    }
  }
  // Fallback for a browser without createImageBitmap: an <img> + object URL.
  const url = URL.createObjectURL(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("image decode failed"))
    el.src = url
  })
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, crop) => {
      ctx.drawImage(
        img,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        PICTURE_OUTPUT_WIDTH,
        PICTURE_OUTPUT_HEIGHT,
      )
    },
    dispose: () => URL.revokeObjectURL(url),
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      PICTURE_OUTPUT_MIME,
      quality,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Full client pipeline for a picture `File`: validate, decode, cover-crop to
 * 960x540, encode as JPEG stepping the quality down to fit the byte budget,
 * and return a base64 `data:image/jpeg;base64,...` URL ready to send inside
 * `createEvent`'s plain-object argument. Requires a browser.
 */
export async function processPictureFile(file: File): Promise<PictureResult> {
  const check = validatePictureFile(file)
  if (!check.ok) return check

  let decoded: DecodedImage
  try {
    decoded = await decodeImageFile(file)
  } catch {
    return { ok: false, error: "DECODE_FAILED" }
  }
  try {
    if (!decoded.width || !decoded.height) {
      return { ok: false, error: "DECODE_FAILED" }
    }

    const crop = computeCoverCrop(decoded.width, decoded.height)
    const canvas = document.createElement("canvas")
    canvas.width = PICTURE_OUTPUT_WIDTH
    canvas.height = PICTURE_OUTPUT_HEIGHT
    const ctx = canvas.getContext("2d")
    if (!ctx) return { ok: false, error: "DECODE_FAILED" }
    decoded.draw(ctx, crop)

    const encoded = await encodeWithBudget((quality) =>
      canvasToBlob(canvas, quality),
    )
    if (!encoded.ok) return encoded

    const dataUrl = await blobToDataUrl(encoded.result)
    return { ok: true, dataUrl }
  } catch {
    return { ok: false, error: "DECODE_FAILED" }
  } finally {
    decoded.dispose()
  }
}

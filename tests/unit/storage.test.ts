import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/strings"
import {
  computeCoverCrop,
  encodeWithBudget,
  pictureErrorMessage,
  PICTURE_MAX_INPUT_BYTES,
  PICTURE_MAX_OUTPUT_BYTES,
  PICTURE_OUTPUT_HEIGHT,
  PICTURE_OUTPUT_WIDTH,
  PICTURE_QUALITY_STEPS,
  validatePictureFile,
} from "@/lib/storage"

const t = STRINGS.addEventModal.errors

describe("validatePictureFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s within the size budget",
    (type) => {
      expect(validatePictureFile({ type, size: 1024 })).toEqual({ ok: true })
    },
  )

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/plain", ""])(
    "rejects unsupported type %j",
    (type) => {
      expect(validatePictureFile({ type, size: 1024 })).toEqual({
        ok: false,
        error: "UNSUPPORTED_TYPE",
      })
    },
  )

  it("accepts a file exactly at the size ceiling", () => {
    expect(
      validatePictureFile({ type: "image/jpeg", size: PICTURE_MAX_INPUT_BYTES }),
    ).toEqual({ ok: true })
  })

  it("rejects a file one byte over the ceiling", () => {
    expect(
      validatePictureFile({
        type: "image/jpeg",
        size: PICTURE_MAX_INPUT_BYTES + 1,
      }),
    ).toEqual({ ok: false, error: "FILE_TOO_LARGE" })
  })

  it.each([0, -1])("rejects a non-positive size (%d)", (size) => {
    expect(validatePictureFile({ type: "image/jpeg", size })).toEqual({
      ok: false,
      error: "FILE_TOO_LARGE",
    })
  })

  it("type check runs before the size check (both wrong -> UNSUPPORTED_TYPE)", () => {
    expect(
      validatePictureFile({ type: "image/gif", size: PICTURE_MAX_INPUT_BYTES + 1 }),
    ).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" })
  })
})

describe("computeCoverCrop", () => {
  const TARGET_RATIO = PICTURE_OUTPUT_WIDTH / PICTURE_OUTPUT_HEIGHT

  it("source already exactly 16:9 -> no cropping, full frame kept", () => {
    expect(computeCoverCrop(1920, 1080)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
    })
  })

  it("wider source (e.g. an ultra-wide photo) -> crops left/right, keeps full height", () => {
    const crop = computeCoverCrop(4000, 1000)
    expect(crop.sy).toBe(0)
    expect(crop.sh).toBe(1000)
    expect(crop.sw).toBeCloseTo(1000 * TARGET_RATIO, 5)
    expect(crop.sx).toBeCloseTo((4000 - crop.sw) / 2, 5)
    // The crop is centered.
    expect(crop.sx).toBeCloseTo(4000 - crop.sx - crop.sw, 5)
  })

  it("taller source (e.g. a portrait photo) -> crops top/bottom, keeps full width", () => {
    const crop = computeCoverCrop(1000, 4000)
    expect(crop.sx).toBe(0)
    expect(crop.sw).toBe(1000)
    expect(crop.sh).toBeCloseTo(1000 / TARGET_RATIO, 5)
    expect(crop.sy).toBeCloseTo((4000 - crop.sh) / 2, 5)
  })

  it("square source -> crops top/bottom (square is relatively taller than 16:9)", () => {
    const crop = computeCoverCrop(1000, 1000)
    expect(crop.sx).toBe(0)
    expect(crop.sw).toBe(1000)
    expect(crop.sh).toBeLessThan(1000)
  })

  it("the resulting crop rectangle always has the target aspect ratio", () => {
    for (const [w, h] of [
      [4000, 1000],
      [1000, 4000],
      [1000, 1000],
      [1920, 1081],
      [1919, 1080],
    ]) {
      const crop = computeCoverCrop(w, h)
      expect(crop.sw / crop.sh).toBeCloseTo(TARGET_RATIO, 5)
    }
  })
})

describe("encodeWithBudget (quality-stepping decision logic)", () => {
  it("returns the first quality step that fits the budget", async () => {
    const sizesByQuality: Record<number, number> = {
      0.85: 900_000,
      0.7: 520_000,
      0.55: 300_000,
      0.4: 100_000,
    }
    const attempts: number[] = []
    const encode = async (quality: number) => {
      attempts.push(quality)
      return { size: sizesByQuality[quality] }
    }
    const result = await encodeWithBudget(encode)
    expect(result).toEqual({
      ok: true,
      result: { size: 300_000 },
      quality: 0.55,
    })
    // Stops at the first step that fits: does not try 0.4.
    expect(attempts).toEqual([0.85, 0.7, 0.55])
  })

  it("the very first step already fits: only one attempt", async () => {
    const encode = async () => ({ size: 1000 })
    const result = await encodeWithBudget(encode)
    expect(result).toEqual({ ok: true, result: { size: 1000 }, quality: 0.85 })
  })

  it("exactly at the byte budget counts as fitting", async () => {
    const encode = async () => ({ size: PICTURE_MAX_OUTPUT_BYTES })
    const result = await encodeWithBudget(encode)
    expect(result.ok).toBe(true)
  })

  it("one byte over budget at every step -> COMPRESSION_FAILED, all steps tried", async () => {
    const attempts: number[] = []
    const encode = async (quality: number) => {
      attempts.push(quality)
      return { size: PICTURE_MAX_OUTPUT_BYTES + 1 }
    }
    const result = await encodeWithBudget(encode)
    expect(result).toEqual({ ok: false, error: "COMPRESSION_FAILED" })
    expect(attempts).toEqual([...PICTURE_QUALITY_STEPS])
  })

  it("uses the exported default quality steps in order", async () => {
    const attempts: number[] = []
    await encodeWithBudget(async (q) => {
      attempts.push(q)
      return { size: Number.POSITIVE_INFINITY }
    })
    expect(attempts).toEqual([0.85, 0.7, 0.55, 0.4])
  })

  it("respects an injected custom quality list and budget", async () => {
    const attempts: number[] = []
    const result = await encodeWithBudget(
      async (q) => {
        attempts.push(q)
        return { size: 50 }
      },
      [0.9, 0.5],
      10,
    )
    expect(result).toEqual({ ok: false, error: "COMPRESSION_FAILED" })
    expect(attempts).toEqual([0.9, 0.5])
  })
})

describe("pictureErrorMessage", () => {
  it("maps every reject reason to its own es-PE string", () => {
    expect(pictureErrorMessage("UNSUPPORTED_TYPE")).toBe(t.pictureUnsupportedType)
    expect(pictureErrorMessage("FILE_TOO_LARGE")).toBe(t.pictureTooLarge)
    expect(pictureErrorMessage("DECODE_FAILED")).toBe(t.pictureDecodeFailed)
    expect(pictureErrorMessage("COMPRESSION_FAILED")).toBe(
      t.pictureCompressionFailed,
    )
    // Every message is distinct (no accidental reuse) and none of them is
    // the generic "required fields" message.
    const messages = [
      t.pictureUnsupportedType,
      t.pictureTooLarge,
      t.pictureDecodeFailed,
      t.pictureCompressionFailed,
    ]
    expect(new Set(messages).size).toBe(messages.length)
    expect(messages).not.toContain(t.required)
  })
})

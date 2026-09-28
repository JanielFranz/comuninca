/**
 * Feature #14: the calendar reads Postgres, so app code must not import the
 * prototype seed data/constants. `lib/constants.ts` itself, `prisma/**` (the
 * dev seed) and tests are allowed to use them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "../..")
const FORBIDDEN = ["SEED_EVENTS", "USERS", "findUser", "TODAY"]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const files = ["app", "components", "lib"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => relative(ROOT, f).replace(/\\/g, "/") !== "lib/constants.ts")

/** Names imported from a module whose specifier ends in "constants". */
function importedFromConstants(src: string): string[] {
  const names: string[] = []
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*constants["']/g
  for (const m of src.matchAll(re)) {
    for (const part of m[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/)[0]
      if (n) names.push(n)
    }
  }
  return names
}

describe("app code does not import prototype seed data", () => {
  it("scans a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(FORBIDDEN)("no app file imports %s from lib/constants", (name) => {
    const offenders = files
      .filter((f) =>
        importedFromConstants(readFileSync(f, "utf8")).includes(name),
      )
      .map((f) => relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it("the import detector itself catches a forbidden import", () => {
    const sample = `import { CONFIG, SEED_EVENTS as S } from "@/lib/constants"`
    expect(importedFromConstants(sample)).toEqual(["CONFIG", "SEED_EVENTS"])
  })
})

"use server"

import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateUniqueInviteCodes } from "@/lib/inviteCode"
import {
  CODES_PAGE_SIZE,
  parseCodeStatus,
  type CodeStatus,
} from "@/lib/codesQuery"
import { clampPage, computePageCount, parsePage } from "@/lib/usersQuery"
import { GenerateCodesSchema, RevokeCodeSchema } from "@/lib/validation/invites"

export type GeneratedCode = { code: string; createdAt: string }

export type GenerateInviteCodesResult =
  | { ok: true; codes: GeneratedCode[] }
  | {
      ok: false
      error: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_INPUT" | "UNEXPECTED"
    }

const MAX_ATTEMPTS = 3

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  )
}

export async function generateInviteCodes(input: {
  count: number
}): Promise<GenerateInviteCodesResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = GenerateCodesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" }
  const { count } = parsed.data

  // Deliberately not logging errors or codes.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // One statement: all rows are inserted or none are.
      const rows = await prisma.inviteCode.createManyAndReturn({
        data: generateUniqueInviteCodes(count).map((code) => ({ code })),
        select: { code: true, createdAt: true },
      })
      if (rows.length !== count) return { ok: false, error: "UNEXPECTED" }
      return {
        ok: true,
        codes: rows.map((r) => ({
          code: r.code,
          createdAt: r.createdAt.toISOString(),
        })),
      }
    } catch (e) {
      if (!isUniqueViolation(e)) return { ok: false, error: "UNEXPECTED" }
    }
  }
  return { ok: false, error: "UNEXPECTED" }
}

export type CodeRow = {
  id: string
  code: string
  status: CodeStatus
  createdAt: string
  usedAt: string | null
  usedBy: { fullName: string; email: string } | null
}

export type ListInviteCodesResult =
  | {
      ok: true
      codes: CodeRow[]
      total: number
      page: number
      pageCount: number
      pageSize: number
      status: CodeStatus | null
    }
  | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "UNEXPECTED" }

export async function listInviteCodes(input: {
  page?: unknown
  status?: unknown
}): Promise<ListInviteCodesResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  try {
    const status = parseCodeStatus(input?.status)
    const requestedPage = parsePage(input?.page)
    const where = status ? { status } : {}

    const total = await prisma.inviteCode.count({ where })
    const pageCount = computePageCount(total, CODES_PAGE_SIZE)
    const page = clampPage(requestedPage, pageCount)

    const rows = await prisma.inviteCode.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * CODES_PAGE_SIZE,
      take: CODES_PAGE_SIZE,
      select: {
        id: true,
        code: true,
        status: true,
        createdAt: true,
        usedAt: true,
        usedBy: { select: { fullName: true, email: true } },
      },
    })

    return {
      ok: true,
      codes: rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        usedAt: r.usedAt ? r.usedAt.toISOString() : null,
        usedBy: r.usedBy
          ? { fullName: r.usedBy.fullName, email: r.usedBy.email }
          : null,
      })),
      total,
      page,
      pageCount,
      pageSize: CODES_PAGE_SIZE,
      status,
    }
  } catch {
    // Deliberately no error text.
    return { ok: false, error: "UNEXPECTED" }
  }
}

export type RevokeInviteCodeResult =
  | { ok: true }
  | {
      ok: false
      error:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "NOT_REVOKABLE"
        | "UNEXPECTED"
    }

export async function revokeInviteCode(input: {
  id: string
}): Promise<RevokeInviteCodeResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = RevokeCodeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" }
  const { id } = parsed.data

  try {
    // One conditional write: it races registration (which claims the code
    // with the same UNUSED guard), so exactly one of them wins.
    const { count } = await prisma.inviteCode.updateMany({
      where: { id, status: "UNUSED" },
      data: { status: "EXPIRED" },
    })
    if (count === 1) return { ok: true }

    const existing = await prisma.inviteCode.findUnique({
      where: { id },
      select: { id: true },
    })
    return { ok: false, error: existing ? "NOT_REVOKABLE" : "NOT_FOUND" }
  } catch {
    return { ok: false, error: "UNEXPECTED" }
  }
}

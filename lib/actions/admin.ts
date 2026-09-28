"use server"

import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  USERS_PAGE_SIZE,
  clampPage,
  computePageCount,
  escapeLike,
  normalizeSearch,
  parsePage,
} from "@/lib/usersQuery"

export type UserRow = {
  id: string
  fullName: string
  email: string
  createdAt: string
  birthday: string | null
  profession: string | null
  occupation: string | null
  ikigai: string | null
  inviteCode: string | null
}

export type ListUsersResult =
  | {
      ok: true
      users: UserRow[]
      total: number
      matching: number
      page: number
      pageCount: number
      pageSize: number
      q: string
    }
  | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "UNEXPECTED" }

export async function listUsers(input: {
  page?: unknown
  q?: unknown
}): Promise<ListUsersResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  try {
    const q = normalizeSearch(input?.q)
    const requestedPage = parsePage(input?.page)

    const term = escapeLike(q)
    const where = q
      ? {
          role: "USER" as const,
          OR: [
            { fullName: { contains: term, mode: "insensitive" as const } },
            { email: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : { role: "USER" as const }

    const [total, matching] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      q ? prisma.user.count({ where }) : undefined,
    ])
    const matchingCount = matching ?? total
    const pageCount = computePageCount(matchingCount)
    const page = clampPage(requestedPage, pageCount)

    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        birthday: true,
        profession: true,
        occupation: true,
        ikigai: true,
        inviteCode: { select: { code: true } },
      },
    })

    return {
      ok: true,
      users: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        createdAt: r.createdAt.toISOString(),
        birthday: r.birthday ? r.birthday.toISOString() : null,
        profession: r.profession,
        occupation: r.occupation,
        ikigai: r.ikigai,
        inviteCode: r.inviteCode?.code ?? null,
      })),
      total,
      matching: matchingCount,
      page,
      pageCount,
      pageSize: USERS_PAGE_SIZE,
      q,
    }
  } catch {
    // Deliberately no error text.
    return { ok: false, error: "UNEXPECTED" }
  }
}

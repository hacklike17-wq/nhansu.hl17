import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import {
  isValidSheetUrl,
  validateSheetAccess,
  SheetFetchError,
} from "@/lib/google-sheet-fetcher"

/**
 * GET /api/settings/attendance
 *   Returns the current attendance-related config + latest sync log summary.
 * PATCH /api/settings/attendance
 *   Updates any subset of { autoFillCronEnabled, sheetSyncEnabled, sheetUrl,
 *   sheetMonth }. When `sheetUrl` changes, we HEAD-check the URL (Q13).
 *   When `sheetMonth` changes AND the old url stays the same, we blank the
 *   url to force the admin to paste a fresh link (Q12).
 *
 * Admin-only (Q6).
 */

type PatchBody = {
  autoFillCronEnabled?: boolean
  autoFillCronHour?: number
  sheetSyncEnabled?: boolean
  sheetSyncCronHour?: number
  sheetUrl?: string | null
  sheetMonth?: string | null
}

function isValidHour(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 23
}

const MONTH_RE = /^\d{4}-\d{2}$/

export async function GET() {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const settings = await db.companySettings.findUnique({
      where: { companyId: ctx.companyId },
      select: {
        autoFillCronEnabled: true,
        autoFillCronHour: true,
        sheetSyncEnabled: true,
        sheetSyncCronHour: true,
        sheetUrl: true,
        sheetMonth: true,
      },
    })

    const lastSync = await db.sheetSyncLog.findFirst({
      where: { companyId: ctx.companyId },
      orderBy: { syncedAt: "desc" },
    })

    return NextResponse.json({
      autoFillCronEnabled: settings?.autoFillCronEnabled ?? true,
      autoFillCronHour: settings?.autoFillCronHour ?? 18,
      sheetSyncEnabled: settings?.sheetSyncEnabled ?? false,
      sheetSyncCronHour: settings?.sheetSyncCronHour ?? 19,
      sheetUrl: settings?.sheetUrl ?? null,
      sheetMonth: settings?.sheetMonth ?? null,
      lastSync: lastSync
        ? {
            syncedAt: lastSync.syncedAt,
            status: lastSync.status,
            syncedBy: lastSync.syncedBy,
            rowsAffected: lastSync.rowsAffected,
            errorMessage: lastSync.errorMessage,
          }
        : null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })

    const body = (await req.json()) as PatchBody

    // --- Load current settings so we can detect "changed month but same url" case ---
    const current = await db.companySettings.findUnique({
      where: { companyId: ctx.companyId },
      select: { sheetUrl: true, sheetMonth: true },
    })

    const data: Record<string, unknown> = {}

    if (typeof body.autoFillCronEnabled === "boolean") {
      data.autoFillCronEnabled = body.autoFillCronEnabled
    }
    if (body.autoFillCronHour !== undefined) {
      if (!isValidHour(body.autoFillCronHour)) {
        return NextResponse.json(
          { error: "INVALID_HOUR", message: "Giờ phải là số nguyên từ 0 đến 23" },
          { status: 400 }
        )
      }
      data.autoFillCronHour = body.autoFillCronHour
    }
    if (typeof body.sheetSyncEnabled === "boolean") {
      data.sheetSyncEnabled = body.sheetSyncEnabled
    }
    if (body.sheetSyncCronHour !== undefined) {
      if (!isValidHour(body.sheetSyncCronHour)) {
        return NextResponse.json(
          { error: "INVALID_HOUR", message: "Giờ phải là số nguyên từ 0 đến 23" },
          { status: 400 }
        )
      }
      data.sheetSyncCronHour = body.sheetSyncCronHour
    }

    // --- Normalize + validate sheetMonth ---
    let newMonth: string | null | undefined
    if (body.sheetMonth !== undefined) {
      if (body.sheetMonth === null || body.sheetMonth === "") {
        newMonth = null
      } else if (!MONTH_RE.test(body.sheetMonth)) {
        return NextResponse.json(
          { error: "INVALID_MONTH", message: "Tháng phải định dạng YYYY-MM" },
          { status: 400 }
        )
      } else {
        newMonth = body.sheetMonth
      }
      data.sheetMonth = newMonth
    }

    // --- Normalize + validate sheetUrl ---
    let newUrl: string | null | undefined
    if (body.sheetUrl !== undefined) {
      if (body.sheetUrl === null || body.sheetUrl === "") {
        newUrl = null
      } else {
        if (!isValidSheetUrl(body.sheetUrl)) {
          return NextResponse.json(
            { error: "INVALID_URL_FORMAT", message: "Link phải là Google Sheets (docs.google.com/spreadsheets/...)" },
            { status: 400 }
          )
        }
        // HEAD-check the URL so a private sheet gets caught at save time,
        // not 24 hours later when the cron runs.
        try {
          await validateSheetAccess(body.sheetUrl)
        } catch (e) {
          if (e instanceof SheetFetchError) {
            return NextResponse.json(
              { error: e.code, message: e.message },
              { status: 400 }
            )
          }
          throw e
        }
        newUrl = body.sheetUrl
      }
      data.sheetUrl = newUrl
    }

    // --- Q12: month changed but url stayed the same → reset url to force
    // admin to paste a fresh link for the new month. ---
    if (
      newMonth !== undefined &&
      newMonth !== current?.sheetMonth &&
      body.sheetUrl === undefined
    ) {
      data.sheetUrl = null
    }

    // --- Upsert (settings row created at seed time, but be defensive) ---
    await db.companySettings.upsert({
      where: { companyId: ctx.companyId },
      create: {
        companyId: ctx.companyId,
        ...data,
      },
      update: data,
    })

    // --- Return fresh snapshot ---
    const fresh = await db.companySettings.findUnique({
      where: { companyId: ctx.companyId },
      select: {
        autoFillCronEnabled: true,
        autoFillCronHour: true,
        sheetSyncEnabled: true,
        sheetSyncCronHour: true,
        sheetUrl: true,
        sheetMonth: true,
      },
    })

    return NextResponse.json(fresh, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return errorResponse(e)
  }
}

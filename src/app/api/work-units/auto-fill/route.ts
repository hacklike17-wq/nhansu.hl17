import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"
import { lockedEmployeeIdsForMonth } from "@/lib/chamcong-guard"
import { recalculateMonth } from "@/lib/services/payroll.service"

/**
 * POST /api/work-units/auto-fill
 * Body: { month?: "YYYY-MM" }  (optional — defaults to current UTC+7 month)
 *
 * Auto-fill attendance for the specified month, respecting the company's
 * actual schedule.
 *
 * Rules (chốt theo brainstorm):
 *  1. Tuần làm 6 ngày: Mon–Sat. Chủ nhật bỏ qua.
 *  2. Phạm vi ngày: [monthStart, min(monthEnd, today)]
 *     - Tháng hiện tại: 1 → hôm nay
 *     - Tháng quá khứ:  1 → ngày cuối tháng đó
 *     - Tháng tương lai: reject 400
 *  3. Phạm vi NV: từ MAX(startDate, monthStart) tới MIN(endDate ?? cutoff, cutoff).
 *  4. Ngày NV có UNPAID LeaveRequest APPROVED cover → tạo row units=0 + note
 *  5. Idempotent: rows tồn tại (manager sửa hoặc auto-fill trước) → giữ nguyên
 *  6. KHÔNG cleanup rows tương lai
 *
 * Salary calculation logic is NOT touched. Schema is NOT changed.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const companyId = ctx.companyId

    // ── Parse body (optional month) ───────────────────────────────
    let bodyMonth: string | undefined
    try {
      const raw = await req.text()
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.month === "string") bodyMonth = parsed.month
      }
    } catch {
      // Empty body or malformed JSON → fall through to current month default
    }

    // ── Vietnam-time "today" (cutoff for cận trên) ────────────────
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000
    const nowVN = new Date(Date.now() + VN_OFFSET_MS)
    const todayY = nowVN.getUTCFullYear()
    const todayM = nowVN.getUTCMonth()
    const todayD = nowVN.getUTCDate()
    const todayUTC = new Date(Date.UTC(todayY, todayM, todayD))

    // ── Resolve target month (default = current) ─────────────────
    let targetY: number
    let targetM: number  // 0-indexed
    if (bodyMonth) {
      if (!/^\d{4}-\d{2}$/.test(bodyMonth)) {
        return NextResponse.json({ error: "month phải ở định dạng YYYY-MM" }, { status: 400 })
      }
      const [yy, mm] = bodyMonth.split("-").map(Number)
      targetY = yy
      targetM = mm - 1
    } else {
      targetY = todayY
      targetM = todayM
    }

    const monthStart = new Date(Date.UTC(targetY, targetM, 1))
    const monthLastDay = new Date(Date.UTC(targetY, targetM + 1, 0))

    // Reject if the entire target month is in the future (monthStart > today)
    if (monthStart > todayUTC) {
      return NextResponse.json(
        { error: "Không thể chấm công cho tháng tương lai" },
        { status: 400 }
      )
    }

    // Cutoff: if target month is current month → today, else → end of month
    const cutoff = monthLastDay < todayUTC ? monthLastDay : todayUTC

    // Tuần làm 6 ngày: build danh sách Mon-Sat từ ngày 1 → cutoff
    const monthWorkdays: Date[] = []
    const cutoffDay = cutoff.getUTCDate()
    for (let day = 1; day <= cutoffDay; day++) {
      const dayDate = new Date(Date.UTC(targetY, targetM, day))
      if (dayDate.getUTCDay() !== 0) monthWorkdays.push(dayDate)
    }

    const monthLabel = `${String(targetM + 1).padStart(2, "0")}/${targetY}`

    if (monthWorkdays.length === 0) {
      return NextResponse.json({
        ok: true,
        month: `${targetY}-${String(targetM + 1).padStart(2, "0")}`,
        monthLabel,
        created: 0,
        skippedExisting: 0,
        skippedLeave: 0,
        message: "Chưa có ngày làm việc nào",
      })
    }

    // ── Active employees + their work range ──────────────────────
    const employees = await db.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["WORKING", "HALF", "REMOTE"] },
        accountStatus: { not: "NO_ACCOUNT" },
      },
      select: { id: true, startDate: true, endDate: true },
    })

    if (employees.length === 0) {
      return NextResponse.json({
        ok: true,
        month: `${targetY}-${String(targetM + 1).padStart(2, "0")}`,
        monthLabel,
        created: 0,
        skippedExisting: 0,
        skippedLeave: 0,
      })
    }

    const employeeIds = employees.map(e => e.id)

    // ── Skip employees whose payroll for target month is NOT DRAFT ──
    // (PENDING / APPROVED / LOCKED / PAID). Their data is frozen; auto-fill
    // must not silently mutate it.
    const lockedEmpIds = await lockedEmployeeIdsForMonth(companyId, monthStart, employeeIds)

    // ── Existing WorkUnits in range — for idempotency ─────────────
    const existing = await db.workUnit.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        date: { gte: monthStart, lte: cutoff },
      },
      select: { employeeId: true, date: true },
    })
    const existingKey = new Set(
      existing.map(w => `${w.employeeId}::${(w.date as Date).toISOString().slice(0, 10)}`)
    )

    // ── UNPAID leave requests covering any day in [monthStart, cutoff] ──
    const unpaidLeaves = await db.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        type: "UNPAID",
        status: "APPROVED",
        // Overlap: leave.endDate >= monthStart AND leave.startDate <= cutoff
        endDate: { gte: monthStart },
        startDate: { lte: cutoff },
      },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    })

    // Build per-employee map: dateString → leave id
    const leaveByEmpDate = new Map<string, string>()
    for (const lv of unpaidLeaves) {
      const start = lv.startDate as Date
      const end = lv.endDate as Date
      const cursor = new Date(Math.max(start.getTime(), monthStart.getTime()))
      const stop = new Date(Math.min(end.getTime(), cutoff.getTime()))
      while (cursor <= stop) {
        const key = `${lv.employeeId}::${cursor.toISOString().slice(0, 10)}`
        leaveByEmpDate.set(key, lv.id)
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }

    // ── Build rows to insert ──────────────────────────────────────
    type Row = {
      companyId: string
      employeeId: string
      date: Date
      units: number
      note: string | null
    }
    const rowsToCreate: Row[] = []
    let skippedExisting = 0
    let skippedLeave = 0
    let skippedLocked = 0

    for (const emp of employees) {
      // Skip NV has non-DRAFT payroll for target month
      if (lockedEmpIds.has(emp.id)) {
        skippedLocked++
        continue
      }

      const empStart = emp.startDate as Date
      // Cận trên = min(endDate, cutoff). Nếu endDate < monthStart → skip.
      const empEnd = (emp.endDate as Date | null) ?? cutoff
      if (empEnd < monthStart) continue

      for (const day of monthWorkdays) {
        // Phạm vi NV: chỉ tạo trong [empStart, empEnd] (đã cap bởi cutoff)
        if (day < empStart) continue
        if (day > empEnd) continue

        const key = `${emp.id}::${day.toISOString().slice(0, 10)}`

        // Idempotent check
        if (existingKey.has(key)) {
          skippedExisting++
          continue
        }

        // UNPAID leave check
        const leaveId = leaveByEmpDate.get(key)
        if (leaveId) {
          rowsToCreate.push({
            companyId,
            employeeId: emp.id,
            date: day,
            units: 0,
            note: `Nghỉ không lương — đơn ${leaveId.slice(0, 8)}`,
          })
          skippedLeave++
          continue
        }

        // Default workday: 1 công
        rowsToCreate.push({
          companyId,
          employeeId: emp.id,
          date: day,
          units: 1,
          note: null,
        })
      }
    }

    let createdCount = 0
    if (rowsToCreate.length > 0) {
      const result = await db.workUnit.createMany({
        data: rowsToCreate,
        skipDuplicates: true,
      })
      createdCount = result.count

      // Sync DRAFT payrolls for the affected month so Payroll.netWorkUnits /
      // congSoNhan stay in step with the newly-created WorkUnit rows.
      const targetMonthStart = new Date(Date.UTC(targetY, targetM, 1))
      recalculateMonth(companyId, targetMonthStart).catch(err =>
        console.warn("recalculateMonth after auto-fill failed:", err)
      )
    }

    // skippedLeave is included in rowsToCreate (as units=0). Subtract from
    // "default" creation count to report the breakdown clearly.
    const createdDefault = createdCount - skippedLeave

    const monthKey = `${targetY}-${String(targetM + 1).padStart(2, "0")}`

    // Audit: 1 row per auto-fill batch (summary, not per cell)
    if (createdCount > 0 || skippedLocked > 0) {
      db.auditLog.create({
        data: {
          companyId,
          entityType: "WorkUnit",
          entityId: "AUTO_FILL",
          action: "AUTO_FILL",
          changedBy: ctx.userId,
          changes: {
            month: monthKey,
            monthLabel,
            cutoff: cutoff.toISOString().slice(0, 10),
            employees: employees.length,
            workdaysProcessed: monthWorkdays.length,
            created: createdDefault,
            createdLeaveZeroes: skippedLeave,
            skippedExisting,
            skippedLocked,
          },
        },
      }).catch(err => console.warn("audit auto-fill failed:", err))
    }

    return NextResponse.json(
      {
        ok: true,
        month: monthKey,
        monthLabel,
        cutoff: cutoff.toISOString().slice(0, 10),
        employees: employees.length,
        workdaysProcessed: monthWorkdays.length,
        created: createdDefault,
        createdLeaveZeroes: skippedLeave,
        skippedExisting,
        skippedLocked,
        totalCreated: createdCount,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}

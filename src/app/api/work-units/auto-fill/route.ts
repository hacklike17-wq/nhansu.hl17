import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePermission, errorResponse } from "@/lib/permission"

/**
 * POST /api/work-units/auto-fill
 *
 * Auto-fill attendance from the 1st of the current month up to TODAY (UTC+7),
 * respecting the company's actual schedule.
 *
 * Rules (all chốt theo brainstorm):
 *  1. Tuần làm 6 ngày: Mon–Sat. Chủ nhật bỏ qua.
 *  2. Phạm vi: từ MAX(startDate, ngày 1 tháng) tới MIN(endDate ?? today, today).
 *     → Không tạo cho ngày NV chưa vào hoặc đã nghỉ việc.
 *  3. Ngày tương lai (> today): KHÔNG tạo. KHÔNG cleanup rows tương lai cũ
 *     (manager tự dùng nút "Xoá tháng" hiện có nếu cần dọn).
 *  4. Ngày NV có UNPAID LeaveRequest APPROVED cover → tạo row units=0
 *     với note "Nghỉ không lương — đơn #..." (cell hiện 0 đỏ, có audit trail).
 *  5. Idempotent: nếu row đã tồn tại (manager hoặc lần auto-fill trước đã
 *     tạo), KHÔNG ghi đè — giữ nguyên giá trị + note.
 *
 * Salary calculation logic is NOT touched. Schema is NOT changed.
 */
export async function POST(_req: NextRequest) {
  try {
    const ctx = await requirePermission("chamcong.edit")
    if (!ctx.companyId) return NextResponse.json({ error: "No company context" }, { status: 400 })
    const companyId = ctx.companyId

    // ── Vietnam-time "today" ──────────────────────────────────────
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000
    const nowVN = new Date(Date.now() + VN_OFFSET_MS)
    const y = nowVN.getUTCFullYear()
    const m = nowVN.getUTCMonth()
    const d = nowVN.getUTCDate()
    const todayUTC = new Date(Date.UTC(y, m, d))
    const monthStart = new Date(Date.UTC(y, m, 1))

    // Tuần làm 6 ngày: build danh sách Mon-Sat từ ngày 1 → today
    const monthWorkdays: Date[] = []
    for (let day = 1; day <= d; day++) {
      const dayDate = new Date(Date.UTC(y, m, day))
      if (dayDate.getUTCDay() !== 0) monthWorkdays.push(dayDate)
    }

    if (monthWorkdays.length === 0) {
      return NextResponse.json({
        ok: true,
        today: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        created: 0,
        skippedExisting: 0,
        skippedLeave: 0,
        message: "Chưa có ngày làm việc nào trong tháng",
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
        today: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        created: 0,
        skippedExisting: 0,
        skippedLeave: 0,
      })
    }

    const employeeIds = employees.map(e => e.id)

    // ── Existing WorkUnits in range — for idempotency ─────────────
    const existing = await db.workUnit.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        date: { gte: monthStart, lte: todayUTC },
      },
      select: { employeeId: true, date: true },
    })
    const existingKey = new Set(
      existing.map(w => `${w.employeeId}::${(w.date as Date).toISOString().slice(0, 10)}`)
    )

    // ── UNPAID leave requests covering any day in [monthStart, todayUTC] ──
    const unpaidLeaves = await db.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        type: "UNPAID",
        status: "APPROVED",
        // Overlaps our range: leave.endDate >= monthStart AND leave.startDate <= todayUTC
        endDate: { gte: monthStart },
        startDate: { lte: todayUTC },
      },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    })

    // Build per-employee map: dateString → leave id (the leave covering that date)
    const leaveByEmpDate = new Map<string, string>() // key: empId::YYYY-MM-DD → leaveId
    for (const lv of unpaidLeaves) {
      const start = lv.startDate as Date
      const end = lv.endDate as Date
      const cursor = new Date(Math.max(start.getTime(), monthStart.getTime()))
      const stop = new Date(Math.min(end.getTime(), todayUTC.getTime()))
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

    for (const emp of employees) {
      const empStart = emp.startDate as Date
      // Cận trên = min(endDate, today). Nếu endDate < monthStart → skip toàn bộ.
      const empEnd = (emp.endDate as Date | null) ?? todayUTC
      if (empEnd < monthStart) continue

      for (const day of monthWorkdays) {
        // Phạm vi NV: chỉ tạo trong [empStart, min(empEnd, today)]
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
    }

    // skippedLeave is included in rowsToCreate (as units=0). Subtract from
    // "default" creation count to report the breakdown clearly.
    const createdDefault = createdCount - skippedLeave

    // Audit: 1 row per auto-fill batch (summary, not per cell)
    if (createdCount > 0) {
      db.auditLog.create({
        data: {
          companyId,
          entityType: "WorkUnit",
          entityId: "AUTO_FILL", // not a real id — group key for batch ops
          action: "AUTO_FILL",
          changedBy: ctx.userId,
          changes: {
            today: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
            employees: employees.length,
            workdaysProcessed: monthWorkdays.length,
            created: createdDefault,
            createdLeaveZeroes: skippedLeave,
            skippedExisting,
          },
        },
      }).catch(err => console.warn("audit auto-fill failed:", err))
    }

    return NextResponse.json(
      {
        ok: true,
        today: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        employees: employees.length,
        workdaysProcessed: monthWorkdays.length,
        created: createdDefault,
        createdLeaveZeroes: skippedLeave,
        skippedExisting,
        totalCreated: createdCount,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return errorResponse(e)
  }
}

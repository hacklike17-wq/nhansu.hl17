import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { db } from "@/lib/db"
import { requireRole, errorResponse } from "@/lib/permission"
import {
  daysInMonth,
  writeSheetTitleBlock,
  writeMatrixHeader,
} from "@/lib/excel-io"

/**
 * GET /api/data/kpi-violations/export?month=YYYY-MM
 *
 * Dumps current KPI violations to the matrix layout. Each cell holds the
 * comma-joined list of violation codes ("DM", "NS", etc.), or nothing
 * when the employee had no violation that day. Round-trip friendly with
 * the importer's multi-code string parsing.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole("admin")
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng ?month=YYYY-MM" },
        { status: 400 }
      )
    }

    const [y, m] = month.split("-").map(Number)
    const monthStart = new Date(Date.UTC(y, m - 1, 1))
    const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59))

    const [employees, violations, company] = await Promise.all([
      db.employee.findMany({
        where: {
          companyId: ctx.companyId!,
          deletedAt: null,
          status: { in: ["WORKING", "HALF", "REMOTE"] },
        },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, fullName: true, position: true },
      }),
      db.kpiViolation.findMany({
        where: {
          companyId: ctx.companyId!,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true, types: true },
      }),
      db.company.findUnique({
        where: { id: ctx.companyId! },
        select: { name: true },
      }),
    ])

    const lookup = new Map<string, string[]>()
    for (const v of violations) {
      const key = `${v.employeeId}|${v.date.toISOString().slice(0, 10)}`
      lookup.set(key, v.types)
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = "nhansu.hl17"
    const ws = wb.addWorksheet("BẢNG THEO DÕI KP CC")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG THEO DÕI KPI CHUYÊN CẦN",
      monthStr: month,
      subtitleParts: ["Dữ liệu xuất từ hệ thống"],
    })
    const dataStart = writeMatrixHeader(ws, nextRow, days)

    employees.forEach((emp, idx) => {
      const row = ws.getRow(dataStart + idx)
      row.getCell(1).value = idx + 1
      row.getCell(2).value = emp.code ?? ""
      row.getCell(3).value = emp.fullName
      row.getCell(4).value = emp.position ?? ""
      for (let i = 0; i < days.length; i++) {
        const dateISO = days[i].date.toISOString().slice(0, 10)
        const key = `${emp.id}|${dateISO}`
        const types = lookup.get(key)
        if (types && types.length > 0) {
          row.getCell(5 + i).value = types.join(",")
        }
      }
    })

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as BlobPart, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="kpi-${month}.xlsx"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

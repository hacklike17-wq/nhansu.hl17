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
 * GET /api/data/overtime/export?month=YYYY-MM
 *
 * Dumps current overtime_entries rows for the month into the matrix
 * layout, so the user can edit in Excel and re-upload via the unified
 * /api/data/all/import endpoint.
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

    const [employees, entries, company] = await Promise.all([
      db.employee.findMany({
        where: {
          companyId: ctx.companyId!,
          deletedAt: null,
          status: { in: ["WORKING", "HALF", "REMOTE"] },
        },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, fullName: true, position: true },
      }),
      db.overtimeEntry.findMany({
        where: {
          companyId: ctx.companyId!,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true, hours: true },
      }),
      db.company.findUnique({
        where: { id: ctx.companyId! },
        select: { name: true },
      }),
    ])

    const lookup = new Map<string, number>()
    for (const e of entries) {
      const key = `${e.employeeId}|${e.date.toISOString().slice(0, 10)}`
      lookup.set(key, Number(e.hours.toString()))
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = "nhansu.hl17"
    const ws = wb.addWorksheet("CC thêm giờ")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG TỔNG HỢP CC THÊM GIỜ",
      monthStr: month,
      subtitleParts: ["Dữ liệu xuất từ hệ thống · Số = số giờ tăng ca"],
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
        const hours = lookup.get(key)
        if (hours != null && hours > 0) {
          row.getCell(5 + i).value = hours
        }
      }
    })

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as BlobPart, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tang-ca-${month}.xlsx"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

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
 * GET /api/data/work-units/export?month=YYYY-MM
 *
 * Dumps the current work_units rows for `month` into the same matrix format
 * the template uses, so the user can edit in Excel and re-import via
 * /api/data/work-units/import. A `KL` literal is written for cells where the
 * row has `units = 0` AND note contains "Nghỉ" — the inverse mapping of the
 * importer below.
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

    const [employees, workUnits, company] = await Promise.all([
      db.employee.findMany({
        where: {
          companyId: ctx.companyId!,
          deletedAt: null,
          excludeFromPayroll: false,
          status: { in: ["WORKING", "HALF", "REMOTE"] },
        },
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, fullName: true, position: true },
      }),
      db.workUnit.findMany({
        where: {
          companyId: ctx.companyId!,
          date: { gte: monthStart, lte: monthEnd },
        },
        select: {
          employeeId: true,
          date: true,
          units: true,
          note: true,
        },
      }),
      db.company.findUnique({
        where: { id: ctx.companyId! },
        select: { name: true },
      }),
    ])

    // Index by empId|dateISO → { units, note }
    const lookup = new Map<string, { units: number; note: string | null }>()
    for (const wu of workUnits) {
      const key = `${wu.employeeId}|${wu.date.toISOString().slice(0, 10)}`
      lookup.set(key, { units: Number(wu.units.toString()), note: wu.note })
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = "nhansu.hl17"
    const ws = wb.addWorksheet("BẢNG CHẤM CÔNG")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG CHẤM CÔNG",
      monthStr: month,
      subtitleParts: [
        "Dữ liệu xuất từ hệ thống · Số = công · KL = nghỉ không lương · Tổng = tự tính",
      ],
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
        const wu = lookup.get(key)
        if (!wu) continue
        // Invert the importer mapping: units=0 + note contains "Nghỉ" → "KL"
        if (wu.units === 0 && wu.note && /ngh[iì]/i.test(wu.note)) {
          row.getCell(5 + i).value = "KL"
        } else {
          row.getCell(5 + i).value = wu.units
        }
      }

      const lastDayCol = 4 + days.length
      const totalCol = lastDayCol + 1
      row.getCell(totalCol).value = {
        formula: `SUM(${colLetter(5)}${dataStart + idx}:${colLetter(lastDayCol)}${dataStart + idx})`,
      }
    })

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as BlobPart, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cham-cong-${month}.xlsx"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

function colLetter(n: number): string {
  let s = ""
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

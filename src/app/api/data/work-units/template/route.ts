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
 * GET /api/data/work-units/template?month=YYYY-MM
 *
 * Downloads a blank chấm công template pre-filled with the company's active
 * employees. Each row has mã NV + tên NV + chức vụ; all day cells are empty
 * for the user to fill in. Admin-only.
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

    const [employees, company] = await Promise.all([
      db.employee.findMany({
        where: {
          companyId: ctx.companyId!,
          deletedAt: null,
          excludeFromPayroll: false,
          status: { in: ["WORKING", "HALF", "REMOTE"] },
        },
        orderBy: [{ code: "asc" }],
        select: { code: true, fullName: true, position: true },
      }),
      db.company.findUnique({
        where: { id: ctx.companyId! },
        select: { name: true },
      }),
    ])

    const wb = new ExcelJS.Workbook()
    wb.creator = "nhansu.hl17"
    const ws = wb.addWorksheet("BẢNG CHẤM CÔNG")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG CHẤM CÔNG",
      monthStr: month,
      subtitleParts: [
        "Ô trống = chưa chấm · Số thập phân = công (0, 0.5, 1, 1.5, 2) · KL = nghỉ không lương",
      ],
    })

    const dataStart = writeMatrixHeader(ws, nextRow, days)

    employees.forEach((emp, idx) => {
      const row = ws.getRow(dataStart + idx)
      row.getCell(1).value = idx + 1
      row.getCell(2).value = emp.code ?? ""
      row.getCell(3).value = emp.fullName
      row.getCell(4).value = emp.position ?? ""
      // "Tổng" formula for the row (SUM of day cells)
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
        "Content-Disposition": `attachment; filename="cham-cong-template-${month}.xlsx"`,
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

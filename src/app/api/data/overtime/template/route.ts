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
 * GET /api/data/overtime/template?month=YYYY-MM
 *
 * Blank overtime template — same matrix shape as the chấm công template,
 * empty day cells so the user can fill in hours (number 0–12). Column
 * header title reads "BẢNG TỔNG HỢP CC THÊM GIỜ" so the unified importer's
 * name regex picks it up as an overtime sheet on re-upload.
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
    const ws = wb.addWorksheet("CC thêm giờ")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG TỔNG HỢP CC THÊM GIỜ",
      monthStr: month,
      subtitleParts: ["Ô trống = không OT · Số = số giờ tăng ca (0–12)"],
    })
    const dataStart = writeMatrixHeader(ws, nextRow, days)

    employees.forEach((emp, idx) => {
      const row = ws.getRow(dataStart + idx)
      row.getCell(1).value = idx + 1
      row.getCell(2).value = emp.code ?? ""
      row.getCell(3).value = emp.fullName
      row.getCell(4).value = emp.position ?? ""
    })

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as BlobPart, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tang-ca-template-${month}.xlsx"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

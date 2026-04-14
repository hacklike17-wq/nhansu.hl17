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
 * GET /api/data/kpi-violations/template?month=YYYY-MM
 *
 * Blank KPI tracking template. Cell semantics on import: any truthy
 * value ("1", "x", "✓", a number ≥ 1) creates a violation with
 * types=["DM"] (per the agreed default). Multi-code strings like
 * "DM,NS" are also accepted by the importer.
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
    const ws = wb.addWorksheet("BẢNG THEO DÕI KP CC")

    const days = daysInMonth(month)
    const nextRow = writeSheetTitleBlock(ws, {
      companyName: company?.name ?? "",
      title: "BẢNG THEO DÕI KPI CHUYÊN CẦN",
      monthStr: month,
      subtitleParts: [
        "Ô trống = không vi phạm · 1 hoặc x = có vi phạm (mặc định DM)",
        "Có thể ghi nhiều loại: DM,NS,NP / DM;QC / …",
      ],
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
        "Content-Disposition": `attachment; filename="kpi-template-${month}.xlsx"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

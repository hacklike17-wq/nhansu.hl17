import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import ExcelJS from "exceljs"

const STATUS_LABELS: Record<string, string> = {
  DRAFT:    "Nháp",
  PENDING:  "Chờ duyệt",
  APPROVED: "Đã duyệt",
  LOCKED:   "Đã khóa",
  PAID:     "Đã trả",
}

/**
 * GET /api/export/payroll?month=YYYY-MM
 * Phase 09: Export payroll data to Excel (.xlsx).
 * Requires luong.export or admin/boss_admin role.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as any).role
  const permissions: string[] = (session.user as any).permissions ?? []
  const canExport = ["boss_admin", "admin"].includes(role) || permissions.includes("luong.export")
  if (!canExport) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month là bắt buộc (YYYY-MM)" }, { status: 400 })
  }

  const companyId = (session.user as any).companyId
  const [y, m] = month.split("-").map(Number)
  const monthDate = new Date(Date.UTC(y, m - 1, 1))

  const payrolls = await db.payroll.findMany({
    where: { companyId, month: monthDate },
    include: {
      employee: { select: { code: true, fullName: true, department: true, position: true } },
    },
    orderBy: [{ employee: { department: "asc" } }, { employee: { fullName: "asc" } }],
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = "ADMIN_HL17"
  wb.created = new Date()

  const ws = wb.addWorksheet(`Lương ${month}`)

  ws.columns = [
    { header: "Mã NV",      key: "code",      width: 10 },
    { header: "Họ tên",     key: "name",      width: 25 },
    { header: "Phòng ban",  key: "dept",      width: 18 },
    { header: "Chức vụ",   key: "position",  width: 18 },
    { header: "Lương CB",   key: "base",      width: 16 },
    { header: "Công số",    key: "workUnits", width: 10 },
    { header: "Lương công", key: "workSal",   width: 16 },
    { header: "Tăng ca",    key: "ot",        width: 14 },
    { header: "Phụ cấp",   key: "phuCap",    width: 14 },
    { header: "Gross",      key: "gross",     width: 16 },
    { header: "BHXH NV",    key: "bhxh",      width: 13 },
    { header: "BHYT NV",    key: "bhyt",      width: 13 },
    { header: "BHTN NV",    key: "bhtn",      width: 13 },
    { header: "Thuế TNCN",  key: "pit",       width: 14 },
    { header: "Thực nhận",  key: "net",       width: 16 },
    { header: "Trạng thái", key: "status",    width: 14 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.height = 20
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    }
  })

  const currencyFmt = "#,##0"
  const currencyCols = ["base", "workSal", "ot", "phuCap", "gross", "bhxh", "bhyt", "bhtn", "pit", "net"]

  for (const p of payrolls) {
    const row = ws.addRow({
      code:     (p.employee as any).code ?? "",
      name:     (p.employee as any).fullName,
      dept:     (p.employee as any).department,
      position: (p.employee as any).position ?? "",
      base:     Number(p.baseSalary),
      workUnits:Number(p.netWorkUnits),
      workSal:  Number(p.workSalary),
      ot:       Number(p.overtimePay),
      phuCap:   Number(p.tienPhuCap),
      gross:    Number(p.grossSalary),
      bhxh:     Number(p.bhxhEmployee),
      bhyt:     Number(p.bhytEmployee),
      bhtn:     Number(p.bhtnEmployee),
      pit:      Number(p.pitTax),
      net:      Number(p.netSalary),
      status:   STATUS_LABELS[p.status] ?? p.status,
    })

    // Apply currency format to numeric columns
    currencyCols.forEach(key => {
      const cell = row.getCell(key)
      cell.numFmt = currencyFmt
      cell.alignment = { horizontal: "right" }
    })

    // Highlight total row
    const netCell = row.getCell("net")
    netCell.font = { bold: true, color: { argb: "FF2563EB" } }
  }

  // Freeze top row
  ws.views = [{ state: "frozen", ySplit: 1 }]

  // Auto-filter
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } }

  const buffer = await wb.xlsx.writeBuffer()

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bang-luong-${month}.xlsx"`,
      "Cache-Control": "no-store, no-cache",
    },
  })
}

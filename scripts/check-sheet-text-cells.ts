/**
 * check-sheet-text-cells.ts — quét Google Sheet tìm các ô chứa text
 * trông-như-số (vd "0.5" thay vì 0.5). Những ô này sẽ bị Excel SUM()
 * bỏ qua, gây sai lệch Tổng công và thiệt thòi cho NV.
 *
 * Usage:
 *   npx tsx scripts/check-sheet-text-cells.ts "<Google Sheet URL>"
 *
 * Example:
 *   npx tsx scripts/check-sheet-text-cells.ts \
 *     "https://docs.google.com/spreadsheets/d/1K6sXSU.../edit?usp=sharing"
 *
 * Exit code: 0 = không có ô nào lỗi · 1 = có ô lỗi (CI-friendly).
 */
import { fetchSheetWorkbook, findTabs, SheetFetchError } from "../src/lib/google-sheet-fetcher"
import type ExcelJS from "exceljs"

type Finding = {
  tab: string
  cell: string
  empCode: string | null
  day: number | null
  rawValue: string
  parsedAs: number
}

function looksLikeNumberString(v: unknown): { parsed: number } | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  // Allow comma or dot decimal, optional sign
  const n = Number(s.replace(",", "."))
  if (!Number.isFinite(n)) return null
  return { parsed: n }
}

/**
 * Scan a worksheet for text-masquerading-as-number. We walk every cell,
 * skip rows that don't have a non-empty MÃ NV in col C (to avoid header /
 * signature noise), and collect any string cell that parses to a number.
 */
function scanTab(ws: ExcelJS.Worksheet): Finding[] {
  const findings: Finding[] = []

  // Find header row and columns (MÃ NV + day columns). Most sheets have it
  // at row 7 — but we walk top-down until we see "MÃ NV" to be robust.
  let headerRow = -1
  let empCodeCol = -1
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= Math.min(10, ws.columnCount); c++) {
      const v = row.getCell(c).value
      const s = typeof v === "string" ? v.trim().toUpperCase() : ""
      if (s === "MÃ NV" || s === "MA NV") {
        headerRow = r
        empCodeCol = c
        break
      }
    }
    if (headerRow > 0) break
  }

  if (headerRow < 0) return findings  // no emp-code header found — skip tab

  // Walk every data row and every cell, flag string cells that parse as
  // numbers. We scan beyond just "day columns" because kế toán sometimes
  // puts a value in the P/LT/TS/KL summary columns too.
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const empCodeVal = row.getCell(empCodeCol).value
    const empCode =
      typeof empCodeVal === "string" && /^[A-Za-z0-9]{2,}$/.test(empCodeVal.trim())
        ? empCodeVal.trim()
        : null
    if (!empCode) continue  // skip header/subheader/signature rows

    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c)
      const v = cell.value
      const match = looksLikeNumberString(v)
      if (!match) continue

      // Allow recognized letter codes (KL/ĐM/NP/LT/TS/QCC) — these are
      // always text and shouldn't be flagged. looksLikeNumberString already
      // skips them because Number("KL") is NaN.
      findings.push({
        tab: ws.name,
        cell: cell.address,
        empCode,
        day: typeof c === "number" ? c - empCodeCol - 1 : null,  // heuristic
        rawValue: String(v),
        parsedAs: match.parsed,
      })
    }
  }

  return findings
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error("Usage: npx tsx scripts/check-sheet-text-cells.ts <URL>")
    process.exit(2)
  }

  console.log(`🔍 Quét sheet: ${url}\n`)

  let wb: ExcelJS.Workbook
  try {
    wb = await fetchSheetWorkbook(url)
  } catch (e) {
    if (e instanceof SheetFetchError) {
      console.error(`❌ Không tải được sheet: [${e.code}] ${e.message}`)
    } else {
      console.error(`❌ Lỗi không mong đợi: ${(e as Error).message}`)
    }
    process.exit(2)
  }

  const tabs = findTabs(wb)
  const toScan = [tabs.workUnit, tabs.overtime, tabs.kpi].filter(Boolean) as ExcelJS.Worksheet[]

  if (toScan.length === 0) {
    console.log(`⚠️  Không tìm thấy tab nào (BANG CHAM CONG / CC thêm giờ / BẢNG THEO DÕI KP CC)`)
    console.log(`   Tabs có trong sheet: ${tabs.availableTabs.join(", ")}`)
    process.exit(2)
  }

  const allFindings: Finding[] = []
  for (const ws of toScan) {
    const f = scanTab(ws)
    allFindings.push(...f)
  }

  if (allFindings.length === 0) {
    console.log("✅ Không có ô text-masquerading-as-number — sheet sạch!")
    process.exit(0)
  }

  console.log(`⚠️  Phát hiện ${allFindings.length} ô text chứa số (Excel SUM sẽ bỏ qua):\n`)
  console.log(
    `${"Tab".padEnd(30)} ${"Ô".padEnd(8)} ${"Mã NV".padEnd(8)} ${"Giá trị text".padEnd(14)} → Parse thành`
  )
  console.log("─".repeat(90))
  for (const f of allFindings) {
    console.log(
      `${f.tab.padEnd(30)} ${f.cell.padEnd(8)} ${(f.empCode ?? "-").padEnd(8)} ${JSON.stringify(f.rawValue).padEnd(14)} → ${f.parsedAs}`
    )
  }

  console.log(
    `\n💡 Cách fix: click từng ô → Format → Number → Automatic/Plain number.\n   Hoặc xoá ô rồi gõ lại số (không có dấu nháy ở đầu).`
  )
  process.exit(1)
}

main().catch(e => {
  console.error("Lỗi:", e)
  process.exit(2)
})

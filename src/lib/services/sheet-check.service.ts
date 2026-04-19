/**
 * sheet-check.service.ts — rà soát Google Sheet tìm ô text trông-như-số.
 *
 * Excel SUM() function bỏ qua text cells, nên nếu kế toán vô tình nhập
 * "0.5" (có dấu nháy hoặc cell format = Text) thay vì 0.5 số → Tổng
 * trong sheet sai, NV bị thiệt thòi công.
 *
 * Dùng chung bởi:
 *   • scripts/check-sheet-text-cells.ts (CLI)
 *   • /api/sync/check-sheet (UI button)
 */
import type ExcelJS from "exceljs"
import { fetchSheetWorkbook, findTabs } from "@/lib/google-sheet-fetcher"

export type TextCellFinding = {
  tab: string
  cell: string
  empCode: string | null
  rawValue: string
  parsedAs: number
}

export type SheetCheckResult = {
  findings: TextCellFinding[]
  tabsScanned: string[]
  availableTabs: string[]
  missingTabs: string[]
}

function looksLikeNumberString(v: unknown): { parsed: number } | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  const n = Number(s.replace(",", "."))
  if (!Number.isFinite(n)) return null
  return { parsed: n }
}

function scanTab(ws: ExcelJS.Worksheet): TextCellFinding[] {
  const findings: TextCellFinding[] = []

  // Find header row + MÃ NV column (heuristic — scan first 15 rows).
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

  if (headerRow < 0) return findings

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const empCodeVal = row.getCell(empCodeCol).value
    const empCode =
      typeof empCodeVal === "string" && /^[A-Za-z0-9]{2,}$/.test(empCodeVal.trim())
        ? empCodeVal.trim()
        : null
    if (!empCode) continue

    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c)
      const match = looksLikeNumberString(cell.value)
      if (!match) continue

      findings.push({
        tab: ws.name,
        cell: cell.address,
        empCode,
        rawValue: String(cell.value),
        parsedAs: match.parsed,
      })
    }
  }

  return findings
}

export async function checkSheet(url: string): Promise<SheetCheckResult> {
  const wb = await fetchSheetWorkbook(url)
  const tabs = findTabs(wb)

  const candidates: Array<{ name: string; ws: ExcelJS.Worksheet | null }> = [
    { name: "BANG CHAM CONG", ws: tabs.workUnit },
    { name: "CC thêm giờ", ws: tabs.overtime },
    { name: "BẢNG THEO DÕI KP CC", ws: tabs.kpi },
  ]

  const findings: TextCellFinding[] = []
  const tabsScanned: string[] = []
  const missingTabs: string[] = []

  for (const { name, ws } of candidates) {
    if (!ws) {
      missingTabs.push(name)
      continue
    }
    tabsScanned.push(ws.name)
    findings.push(...scanTab(ws))
  }

  return {
    findings,
    tabsScanned,
    availableTabs: tabs.availableTabs,
    missingTabs,
  }
}

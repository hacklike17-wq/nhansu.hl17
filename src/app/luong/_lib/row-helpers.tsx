/**
 * Row-level helpers for the Lương & Thưởng page.
 * Pure logic — extracted from page.tsx without changes.
 */
import React from 'react'
import { evalFormula } from '@/lib/formula'
import { fmtVND } from '@/lib/format'
import { COL_FIELD, COL_STYLE } from './constants'

/**
 * Build a vars map from a payroll record + salary column config.
 * Priority: payroll record field > salaryValues entry > formula eval > 0.
 * Columns are processed in order so earlier results feed later formulas.
 */
export function buildRowVars(p: any, cols: any[]): Record<string, number> {
  // Build a quick lookup from salaryValues array (custom columns)
  const svLookup: Record<string, number> = {}
  if (Array.isArray(p.salaryValues)) {
    for (const sv of p.salaryValues) {
      svLookup[sv.columnKey] = Number(sv.value ?? 0)
    }
  }

  const vars: Record<string, number> = {}
  for (const col of cols) {
    const field = COL_FIELD[col.key]
    // 1st priority: payroll record field (system columns)
    const fromRecord = field ? Number(p[field] ?? 0) : null
    // 2nd priority: salaryValues (custom / manual columns)
    const fromSv = svLookup[col.key] ?? null

    const stored = fromRecord ?? fromSv ?? 0

    if (col.type !== 'formula' || !col.formula) {
      vars[col.key] = stored
    } else {
      // Use stored value if non-zero, otherwise evaluate formula on the fly
      vars[col.key] = stored !== 0 ? stored : (evalFormula(col.formula, vars) ?? 0)
    }
  }
  return vars
}

/** Render a single cell value based on its column style */
export function renderCell(key: string, raw: number): React.ReactNode {
  const style = COL_STYLE[key] ?? 'currency'
  if (raw === 0) {
    if (style === 'number') return <span className="text-gray-400">0</span>
    return <span className="text-gray-300">—</span>
  }
  switch (style) {
    case 'number':
      return <span className="text-gray-700">{raw.toFixed(1)}</span>
    case 'ot':
      return <span className="text-orange-600">+{fmtVND(raw)}</span>
    case 'deduction':
      return <span className="text-red-500">-{fmtVND(raw)}</span>
    case 'total':
      return <span className="font-bold text-blue-600">{fmtVND(raw)}</span>
    default:
      return <span className="text-gray-700">{fmtVND(raw)}</span>
  }
}

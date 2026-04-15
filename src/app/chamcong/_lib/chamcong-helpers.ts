/**
 * Shared helpers + display constants for the /chamcong page.
 *
 * Previously inlined at the top of page.tsx. Extracted (Phase 6a refactor)
 * so the LogDrawer sub-component can reuse them without duplicating, and
 * the main page file drops another ~60 lines of boilerplate.
 *
 * All exports are pure — no state, no React imports.
 */
import type { KpiViolationType } from "@/types"

// ─── Date helpers ────────────────────────────────────────────────────────────

export function getDays(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number)
  const total = new Date(y, m, 0).getDate()
  return Array.from({ length: total }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`)
}

/**
 * Tuần làm 6 ngày: Thứ 2 → Thứ 7. Chỉ Chủ nhật là cuối tuần.
 * (Trước đây Sat+Sun đều cuối tuần — đã đổi theo lịch làm việc thực tế.)
 */
export function isWeekend(date: string): boolean {
  const dow = new Date(date + "T00:00:00").getDay()
  return dow === 0 // chỉ Sun
}

export function dayNum(date: string): string {
  return date.slice(8)
}

/** Normalize date from DB (may be ISO string or Date) to YYYY-MM-DD. */
export function toDateStr(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

// ─── Attendance cell rendering ───────────────────────────────────────────────

export function attCls(units: number | null): string {
  if (units === null) return "text-gray-300"
  if (units >= 1.5) return "bg-blue-50 text-blue-700"
  if (units === 1.0) return "bg-green-50 text-green-700"
  if (units > 0) return "bg-amber-50 text-amber-700"
  return "bg-red-50 text-red-500"
}

/**
 * Render a units number at up to 2-decimal precision without trailing zeros:
 *   1      → "1"
 *   1.5    → "1.5"
 *   0.75   → "0.75"
 *   26.25  → "26.25"
 *
 * Never rounds the real value — 0.75 stays 0.75, it does NOT become "0.8".
 */
export function formatUnits(units: number): string {
  return Number(units.toFixed(2)).toString()
}

export function attLabel(units: number | null): string {
  if (units === null) return "·"
  if (units === 1.0) return "1"
  if (units === 0.5) return "½"
  return formatUnits(units)
}

// ─── KPI (Phase 3 của chamcong) ───────────────────────────────────────────────

export const KPI_CONFIG: Record<KpiViolationType, { full: string; cls: string; dot: string }> = {
  DM: { full: "Đi muộn",        cls: "bg-amber-100 text-amber-700 border-amber-200",     dot: "bg-amber-400" },
  NP: { full: "Nghỉ phép",      cls: "bg-blue-100 text-blue-700 border-blue-200",        dot: "bg-blue-400"  },
  NS: { full: "Nghỉ sai",       cls: "bg-red-100 text-red-700 border-red-200",           dot: "bg-red-400"   },
  KL: { full: "Không lương",    cls: "bg-rose-100 text-rose-800 border-rose-200",        dot: "bg-rose-500"  },
  QC: { full: "Quên chấm công", cls: "bg-orange-100 text-orange-700 border-orange-200",  dot: "bg-orange-400" },
}

export const KPI_TYPES = Object.keys(KPI_CONFIG) as KpiViolationType[]

// ─── Deduction type + status maps (used by LogDrawer) ────────────────────────

export const DED_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  NGHI_NGAY: { label: "Nghỉ ngày", cls: "bg-red-50 text-red-700 border-red-200" },
  DI_MUON:   { label: "Đi muộn",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  VE_SOM:    { label: "Về sớm",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
  OVERTIME:  { label: "Tăng ca",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
}

export const DED_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: "Chờ duyệt", cls: "text-amber-600" },
  APPROVED: { label: "Đã duyệt",  cls: "text-green-600" },
  REJECTED: { label: "Từ chối",   cls: "text-red-500"   },
}

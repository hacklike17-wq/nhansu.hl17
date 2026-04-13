'use client'
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePayroll(params: { month?: string; employeeId?: string }) {
  const qs = new URLSearchParams()
  if (params.month) qs.set("month", params.month)
  if (params.employeeId) qs.set("employeeId", params.employeeId)
  const url = `/api/payroll?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus:     true,   // auto-refresh when user tabs back from chamcong page
    revalidateOnReconnect: true,
    dedupingInterval:      3000,
  })

  return {
    payrolls: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
  }
}

export async function generatePayroll(month: string, employeeIds?: string[]) {
  const res = await fetch("/api/payroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, employeeIds }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updatePayrollStatus(
  id: string,
  status: "DRAFT" | "PENDING" | "APPROVED" | "LOCKED" | "PAID",
  note?: string
) {
  const res = await fetch(`/api/payroll/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Phase 04: Generate payroll only for active employees missing a row for this month */
export async function generateMissingPayroll(month: string) {
  const res = await fetch("/api/payroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, missingOnly: true }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Phase 04: Delete a DRAFT payroll row */
export async function deletePayroll(id: string) {
  const res = await fetch(`/api/payroll/${id}`, { method: "DELETE" })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Lỗi khi xóa bản lương")
  return data
}

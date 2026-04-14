'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

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
  return apiFetch<{ ok?: boolean; succeeded?: number; failed?: number }>(
    "/api/payroll",
    {
      method: "POST",
      body: JSON.stringify({ month, employeeIds }),
    }
  )
}

export async function updatePayrollStatus(
  id: string,
  status: "DRAFT" | "PENDING" | "APPROVED" | "LOCKED" | "PAID",
  note?: string
) {
  return apiFetch(`/api/payroll/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  })
}

/** Phase 04: Generate payroll only for active employees missing a row for this month */
export async function generateMissingPayroll(month: string) {
  return apiFetch<{ ok: boolean; succeeded: number }>("/api/payroll", {
    method: "POST",
    body: JSON.stringify({ month, missingOnly: true }),
  })
}

/** Phase 04: Delete a DRAFT payroll row */
export async function deletePayroll(id: string) {
  return apiFetch(`/api/payroll/${id}`, { method: "DELETE" })
}

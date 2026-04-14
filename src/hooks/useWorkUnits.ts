'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useWorkUnits(params: { month?: string; employeeId?: string }) {
  const qs = new URLSearchParams()
  if (params.month) qs.set("month", params.month)
  if (params.employeeId) qs.set("employeeId", params.employeeId)
  const url = `/api/work-units?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    workUnits: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

export async function upsertWorkUnit(payload: {
  employeeId: string
  date: string
  units: number
  note?: string
}) {
  return apiFetch("/api/work-units", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/** Phase 04: Delete all WorkUnits for an employee in a given month */
export async function deleteEmployeeMonth(employeeId: string, month: string) {
  return apiFetch(`/api/work-units?employeeId=${employeeId}&month=${month}`, {
    method: "DELETE",
  })
}

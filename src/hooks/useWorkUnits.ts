'use client'
import useSWR from "swr"

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
  const res = await fetch("/api/work-units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Phase 04: Delete all WorkUnits for an employee in a given month */
export async function deleteEmployeeMonth(employeeId: string, month: string) {
  const res = await fetch(`/api/work-units?employeeId=${employeeId}&month=${month}`, {
    method: "DELETE",
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Lỗi khi xóa")
  return data
}

'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useKpiViolations(params: { month?: string; employeeId?: string }) {
  const qs = new URLSearchParams()
  if (params.month) qs.set("month", params.month)
  if (params.employeeId) qs.set("employeeId", params.employeeId)
  const url = `/api/kpi-violations?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    kpiViolations: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

export async function upsertKpiViolation(payload: {
  employeeId: string
  date: string
  types: string[]
  note?: string
}) {
  return apiFetch("/api/kpi-violations", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

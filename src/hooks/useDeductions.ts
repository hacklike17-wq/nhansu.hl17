'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useDeductions(params: { month?: string; employeeId?: string; status?: string }) {
  const qs = new URLSearchParams()
  if (params.month) qs.set("month", params.month)
  if (params.employeeId) qs.set("employeeId", params.employeeId)
  if (params.status) qs.set("status", params.status)
  const url = `/api/deductions?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    deductions: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

export async function createDeduction(payload: {
  employeeId: string
  date: string
  type: string
  delta: number
  reason: string
}) {
  return apiFetch("/api/deductions", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function approveDeduction(id: string, action: "APPROVED" | "REJECTED") {
  return apiFetch(`/api/deductions/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ action }),
  })
}

'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useLeaveRequests(params?: { employeeId?: string; status?: string }) {
  const qs = new URLSearchParams()
  if (params?.employeeId) qs.set("employeeId", params.employeeId)
  if (params?.status) qs.set("status", params.status)
  const url = `/api/leave-requests?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    leaveRequests: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

export async function createLeaveRequest(payload: {
  employeeId: string
  type: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string
}) {
  return apiFetch("/api/leave-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function approveLeaveRequest(
  id: string,
  action: "APPROVED" | "REJECTED" | "CANCELLED"
) {
  return apiFetch(`/api/leave-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ action }),
  })
}

'use client'
import useSWR from "swr"

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
  const res = await fetch("/api/leave-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function approveLeaveRequest(
  id: string,
  action: "APPROVED" | "REJECTED" | "CANCELLED"
) {
  const res = await fetch(`/api/leave-requests/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

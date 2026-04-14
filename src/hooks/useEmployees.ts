'use client'
import useSWR from "swr"
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useEmployees(params?: { department?: string; search?: string }) {
  const qs = new URLSearchParams()
  if (params?.department) qs.set("department", params.department)
  if (params?.search) qs.set("search", params.search)
  const url = `/api/employees?${qs.toString()}`

  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    employees: (data ?? []) as any[],
    isLoading,
    error,
    mutate,
  }
}

export async function createEmployee(payload: Record<string, unknown>) {
  return apiFetch("/api/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateEmployee(id: string, payload: Record<string, unknown>) {
  return apiFetch(`/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteEmployee(id: string) {
  return apiFetch(`/api/employees/${id}`, { method: "DELETE" })
}

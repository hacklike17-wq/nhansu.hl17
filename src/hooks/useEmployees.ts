'use client'
import useSWR from "swr"

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
  const res = await fetch("/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body)
  }
  return res.json()
}

export async function updateEmployee(id: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/employees/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body)
  }
  return res.json()
}

export async function deleteEmployee(id: string) {
  const res = await fetch(`/api/employees/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}


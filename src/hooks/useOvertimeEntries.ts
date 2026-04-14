import useSWR from 'swr'
import { apiFetch } from "@/lib/api-client"

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useOvertimeEntries(params: { month?: string; employeeId?: string } = {}) {
  const q = new URLSearchParams()
  if (params.month)      q.set('month', params.month)
  if (params.employeeId) q.set('employeeId', params.employeeId)

  const { data, error, mutate } = useSWR<any[]>(
    `/api/overtime?${q.toString()}`,
    fetcher,
    { fallbackData: [] }
  )

  return {
    overtimeEntries: data ?? [],
    loading: !error && !data,
    error,
    mutate,
  }
}

export async function upsertOvertimeEntry(payload: {
  employeeId: string
  date: string
  hours: number
  note?: string
}) {
  return apiFetch('/api/overtime', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

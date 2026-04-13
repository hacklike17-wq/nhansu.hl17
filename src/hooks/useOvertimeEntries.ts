import useSWR from 'swr'

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
  const res = await fetch('/api/overtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

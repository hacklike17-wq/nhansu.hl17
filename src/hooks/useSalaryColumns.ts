import useSWR, { mutate as globalMutate } from 'swr'
import type { SalaryColumn } from '@/types'

const KEY = '/api/salary-columns'
const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useSalaryColumns() {
  const { data, error, isLoading, mutate } = useSWR<SalaryColumn[]>(KEY, fetcher, {
    revalidateOnFocus:      true,
    revalidateOnReconnect:  true,
    dedupingInterval:       2000,
  })

  return {
    salaryColumns: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
  }
}

/** Call from any page after a create/update/delete to invalidate globally */
export function invalidateSalaryColumns() {
  return globalMutate(KEY)
}

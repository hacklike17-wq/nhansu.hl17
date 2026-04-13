import useSWR from 'swr'

const KEY = '/api/settings/company'
const fetcher = (url: string) => fetch(url).then(r => r.json())

export interface CompanySettingsData {
  enableInsuranceTax: boolean
}

export function useCompanySettings() {
  const { data, error, isLoading, mutate } = useSWR<CompanySettingsData>(KEY, fetcher, {
    revalidateOnFocus:     true,   // auto-refresh when user tabs back from caidat
    revalidateOnReconnect: true,
    dedupingInterval:      2000,
    fallbackData:          { enableInsuranceTax: true },
  })

  return {
    enableInsuranceTax: data?.enableInsuranceTax ?? true,
    isLoading,
    error,
    mutate,
  }
}

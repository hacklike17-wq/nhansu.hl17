export function fmtVND(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' tỷ'
  if (Math.abs(n) >= 1e6) return Math.round(n / 1e6) + ' tr'
  return fmtVND(n)
}

export function fmtDate(d: string): string {
  if (!d || d === '—') return '—'
  const date = new Date(d)
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

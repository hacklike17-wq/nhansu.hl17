/**
 * Presentation helpers for the Cài đặt page.
 * Pure functions — extracted from page.tsx without changes.
 */
import { AVATAR_COLORS } from './constants'

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name || '').slice(0, 2).toUpperCase()
}

export function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function genPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 8; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}

export function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return String(val).slice(0, 10)
}

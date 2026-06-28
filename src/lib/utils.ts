import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useEffect } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Closes a modal/popover when the user presses Escape.
// Pass `enabled = false` (e.g. when the modal is closed) to skip the listener.
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onEscape])
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toLocaleString()}`
}

// Parse YYYY-MM-DD as local midnight so toLocaleDateString does not roll back
// a day in west-of-UTC timezones (e.g. "2026-12-31" displaying as Dec 30 in EST).
export function parseDateLocal(dateStr: string): Date {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
  return new Date(dateStr)
}

export function formatDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  if (!dateStr) return '-'
  const d = parseDateLocal(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', options)
}

export function isOverdue(dateStr: string): boolean {
  return parseDateLocal(dateStr) < new Date()
}

export function isDueSoon(dateStr: string, hours = 48): boolean {
  const due = parseDateLocal(dateStr)
  const now = new Date()
  const diff = due.getTime() - now.getTime()
  return diff > 0 && diff < hours * 3600 * 1000
}

export function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function avatarColor(initials: string): string {
  const colors = [
    'from-[#0F4F59] to-[#1F7A78]',
    'from-[#102820] to-[#B8914E]',
    'from-[#244B4A] to-[#D7BE7A]',
    'from-[#233647] to-[#1F7A78]',
    'from-[#5F4A27] to-[#B8914E]',
    'from-[#123F49] to-[#6C8F85]',
    'from-[#2D3A34] to-[#D7BE7A]',
  ]
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % colors.length
  return colors[idx]
}

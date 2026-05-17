import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toLocaleString()}`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}

export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

export function isDueSoon(dateStr: string, hours = 48): boolean {
  const due = new Date(dateStr)
  const now = new Date()
  const diff = due.getTime() - now.getTime()
  return diff > 0 && diff < hours * 3600 * 1000
}

export function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function avatarColor(initials: string): string {
  const colors = [
    'from-indigo-500 to-violet-600',
    'from-cyan-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-fuchsia-500 to-purple-600',
    'from-sky-500 to-indigo-600',
  ]
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % colors.length
  return colors[idx]
}

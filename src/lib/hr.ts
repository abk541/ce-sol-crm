import type { EmployeeRequest, Role } from '../types'

export type HRRoleGroup = 'MANAGER' | 'TEAM_LEAD' | 'ASSOCIATE'

export function hrRoleGroup(role?: Role): HRRoleGroup | null {
  if (!role) return null
  if (role === 'CAPTURE_MANAGER' || role === 'BD_MANAGER' || role === 'OPS_MANAGER') return 'MANAGER'
  if (role === 'TEAM_LEAD') return 'TEAM_LEAD'
  if (role === 'ASSOCIATE') return 'ASSOCIATE'
  return null
}

function parseDateOnly(value?: string): Date | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface ApprovedLeaveUsage {
  holidayDays: number
  sickDays: number
}

/**
 * Counts approved holiday and sick-leave ranges for only the requested
 * employees. Dates are inclusive, clipped to the selected calendar year, and
 * de-duplicated within each employee/type pair. Calendar days remain the unit,
 * so weekends retain the existing behavior and count toward usage.
 */
export function approvedLeaveUsage(
  requests: EmployeeRequest[],
  requesterIds: Iterable<string>,
  year = new Date().getFullYear(),
): ApprovedLeaveUsage {
  const includedRequesters = new Set(requesterIds)
  const holidayDays = new Set<string>()
  const sickDays = new Set<string>()
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)

  requests.forEach(request => {
    if (!includedRequesters.has(request.requesterId) || request.status !== 'APPROVED') return
    if (request.type !== 'TIME_OFF' && request.type !== 'SICK_LEAVE') return
    const rawStart = parseDateOnly(request.leaveStart)
    const rawEnd = parseDateOnly(request.leaveEnd)
    if (!rawStart || !rawEnd) return
    const start = rawStart < yearStart ? yearStart : rawStart
    const end = rawEnd > yearEnd ? yearEnd : rawEnd
    if (start > end) return

    const usedDays = request.type === 'TIME_OFF' ? holidayDays : sickDays
    const cursor = new Date(start)
    while (cursor <= end) {
      usedDays.add(`${request.requesterId}\u0000${dateKey(cursor)}`)
      cursor.setDate(cursor.getDate() + 1)
    }
  })

  return {
    holidayDays: holidayDays.size,
    sickDays: sickDays.size,
  }
}

export function approvedTimeOffDays(requests: EmployeeRequest[], year = new Date().getFullYear()): number {
  return approvedLeaveUsage(
    requests,
    new Set(requests.map(request => request.requesterId)),
    year,
  ).holidayDays
}

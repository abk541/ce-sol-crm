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

export const HOLIDAY_ALLOWANCE_DAYS = 18
export const SICK_LEAVE_ALLOWANCE_DAYS = 30

export interface LeaveBalanceLine {
  allowance: number
  consumed: number
  remaining: number
}

export interface AnnualLeaveBalance {
  holiday: LeaveBalanceLine
  sickLeave: LeaveBalanceLine
}

export interface LeaveRequestBalance {
  year: number
  label: 'Holiday' | 'Sick leave'
  allowance: number
  consumed: number
  remaining: number
  requestedDays: number
  approvedDaysInYear: number
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

export function annualLeaveBalance(
  requests: EmployeeRequest[],
  requesterId: string,
  year = new Date().getFullYear(),
): AnnualLeaveBalance {
  const usage = approvedLeaveUsage(requests, [requesterId], year)
  return {
    holiday: {
      allowance: HOLIDAY_ALLOWANCE_DAYS,
      consumed: usage.holidayDays,
      remaining: Math.max(0, HOLIDAY_ALLOWANCE_DAYS - usage.holidayDays),
    },
    sickLeave: {
      allowance: SICK_LEAVE_ALLOWANCE_DAYS,
      consumed: usage.sickDays,
      remaining: Math.max(0, SICK_LEAVE_ALLOWANCE_DAYS - usage.sickDays),
    },
  }
}

/** Returns the inclusive calendar-day duration of one leave request. */
export function leaveRequestDays(request: EmployeeRequest, year?: number): number {
  const rawStart = parseDateOnly(request.leaveStart)
  const rawEnd = parseDateOnly(request.leaveEnd)
  if (!rawStart || !rawEnd || rawStart > rawEnd) return 0

  const yearStart = year === undefined ? undefined : new Date(year, 0, 1)
  const yearEnd = year === undefined ? undefined : new Date(year, 11, 31)
  const start = yearStart && rawStart < yearStart ? yearStart : rawStart
  const end = yearEnd && rawEnd > yearEnd ? yearEnd : rawEnd
  if (!start || !end || start > end) return 0

  let days = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    days += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Approved calendar days inside the selected year for one history row.
 * Aggregate balances separately de-duplicate overlaps across requests.
 */
export function approvedLeaveRequestDays(
  request: EmployeeRequest,
  year = new Date().getFullYear(),
): number {
  if (request.status !== 'APPROVED') return 0
  if (request.type !== 'TIME_OFF' && request.type !== 'SICK_LEAVE') return 0
  return leaveRequestDays(request, year)
}

/**
 * Resolves the annual balance that belongs directly on a leave request card.
 * The request start year determines the allowance year so historical requests
 * never display the current year's balance.
 */
export function leaveBalanceForRequest(
  requests: EmployeeRequest[],
  request: EmployeeRequest,
  fallbackYear = new Date().getFullYear(),
): LeaveRequestBalance | null {
  if (request.type !== 'TIME_OFF' && request.type !== 'SICK_LEAVE') return null

  const parsedYear = Number(request.leaveStart?.match(/^(\d{4})-/)?.[1])
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 9999
    ? parsedYear
    : fallbackYear
  const balance = annualLeaveBalance(requests, request.requesterId, year)
  const line = request.type === 'TIME_OFF' ? balance.holiday : balance.sickLeave

  return {
    year,
    label: request.type === 'TIME_OFF' ? 'Holiday' : 'Sick leave',
    ...line,
    requestedDays: leaveRequestDays(request),
    approvedDaysInYear: approvedLeaveRequestDays(request, year),
  }
}

export function approvedTimeOffDays(requests: EmployeeRequest[], year = new Date().getFullYear()): number {
  return approvedLeaveUsage(
    requests,
    new Set(requests.map(request => request.requesterId)),
    year,
  ).holidayDays
}

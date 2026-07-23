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
 * Returns one employee's complete holiday/sick-leave request history, newest
 * leave period first. Status is intentionally not filtered so pending,
 * approved, and declined requests remain visible to the employee.
 */
export function employeeLeaveHistory(
  requests: EmployeeRequest[],
  requesterId: string,
): EmployeeRequest[] {
  const sortTime = (request: EmployeeRequest) => {
    const value = request.leaveStart || request.submittedAt
    const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
  }

  return requests
    .filter(request =>
      request.requesterId === requesterId
      && (request.type === 'TIME_OFF' || request.type === 'SICK_LEAVE'),
    )
    .sort((left, right) => sortTime(right) - sortTime(left))
}

export function approvedTimeOffDays(requests: EmployeeRequest[], year = new Date().getFullYear()): number {
  return approvedLeaveUsage(
    requests,
    new Set(requests.map(request => request.requesterId)),
    year,
  ).holidayDays
}

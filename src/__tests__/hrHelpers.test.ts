import { describe, expect, it } from 'vitest'
import { approvedLeaveUsage, approvedTimeOffDays, hrRoleGroup } from '../lib/hr'
import type { EmployeeRequest } from '../types'

function request(overrides: Partial<EmployeeRequest>): EmployeeRequest {
  return {
    id: 'request-1',
    requesterId: 'user-1',
    requesterName: 'Employee',
    requesterEmail: 'employee@example.test',
    type: 'TIME_OFF',
    title: 'Leave',
    details: 'Annual leave',
    status: 'APPROVED',
    priority: 'MEDIUM',
    submittedAt: '2026-01-01T00:00:00.000Z',
    leaveStart: '2026-07-01',
    leaveEnd: '2026-07-05',
    ...overrides,
  }
}

describe('HR role groups', () => {
  it('groups all manager roles together', () => {
    expect(hrRoleGroup('CAPTURE_MANAGER')).toBe('MANAGER')
    expect(hrRoleGroup('BD_MANAGER')).toBe('MANAGER')
    expect(hrRoleGroup('OPS_MANAGER')).toBe('MANAGER')
    expect(hrRoleGroup('TEAM_LEAD')).toBe('TEAM_LEAD')
    expect(hrRoleGroup('ASSOCIATE')).toBe('ASSOCIATE')
  })
})

describe('approved time-off calculations', () => {
  it('counts approved leave inclusively', () => {
    expect(approvedTimeOffDays([request({})], 2026)).toBe(5)
  })

  it('does not count sick leave, pending requests, or duplicate overlapping days', () => {
    expect(approvedTimeOffDays([
      request({ id: 'approved-1', leaveStart: '2026-07-01', leaveEnd: '2026-07-05' }),
      request({ id: 'approved-2', leaveStart: '2026-07-04', leaveEnd: '2026-07-07' }),
      request({ id: 'pending', status: 'PENDING', leaveStart: '2026-08-01', leaveEnd: '2026-08-10' }),
      request({ id: 'sick', type: 'SICK_LEAVE', leaveStart: '2026-09-01', leaveEnd: '2026-09-10' }),
    ], 2026)).toBe(7)
  })

  it('clips a leave range to the selected calendar year', () => {
    expect(approvedTimeOffDays([
      request({ leaveStart: '2025-12-30', leaveEnd: '2026-01-03' }),
    ], 2026)).toBe(3)
  })

  it('counts approved holiday and sick leave separately, including weekends', () => {
    const usage = approvedLeaveUsage([
      request({ id: 'holiday', leaveStart: '2026-07-03', leaveEnd: '2026-07-05' }),
      request({ id: 'sick', type: 'SICK_LEAVE', leaveStart: '2026-08-08', leaveEnd: '2026-08-09' }),
      request({ id: 'pending-sick', type: 'SICK_LEAVE', status: 'PENDING', leaveStart: '2026-09-01', leaveEnd: '2026-09-10' }),
    ], ['user-1'], 2026)

    expect(usage).toEqual({ holidayDays: 3, sickDays: 2 })
  })

  it('clips and de-duplicates approved ranges independently for each leave type', () => {
    const usage = approvedLeaveUsage([
      request({ id: 'holiday-1', leaveStart: '2025-12-30', leaveEnd: '2026-01-03' }),
      request({ id: 'holiday-2', leaveStart: '2026-01-02', leaveEnd: '2026-01-04' }),
      request({ id: 'sick-1', type: 'SICK_LEAVE', leaveStart: '2026-01-03', leaveEnd: '2027-01-02' }),
      request({ id: 'sick-duplicate', type: 'SICK_LEAVE', leaveStart: '2026-01-03', leaveEnd: '2026-01-04' }),
    ], ['user-1'], 2026)

    expect(usage).toEqual({ holidayDays: 4, sickDays: 363 })
  })

  it('isolates one employee while aggregate usage keeps same-date days for each employee', () => {
    const requests = [
      request({ id: 'user-1-holiday', requesterId: 'user-1', leaveStart: '2026-07-01', leaveEnd: '2026-07-02' }),
      request({ id: 'user-1-sick', requesterId: 'user-1', type: 'SICK_LEAVE', leaveStart: '2026-08-01', leaveEnd: '2026-08-01' }),
      request({ id: 'user-2-holiday', requesterId: 'user-2', leaveStart: '2026-07-01', leaveEnd: '2026-07-02' }),
      request({ id: 'user-2-sick', requesterId: 'user-2', type: 'SICK_LEAVE', leaveStart: '2026-08-01', leaveEnd: '2026-08-03' }),
    ]

    expect(approvedLeaveUsage(requests, ['user-1'], 2026)).toEqual({
      holidayDays: 2,
      sickDays: 1,
    })
    expect(approvedLeaveUsage(requests, ['user-1', 'user-2'], 2026)).toEqual({
      holidayDays: 4,
      sickDays: 4,
    })
    expect(approvedLeaveUsage(requests, [], 2026)).toEqual({
      holidayDays: 0,
      sickDays: 0,
    })
  })
})

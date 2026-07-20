import { describe, expect, it } from 'vitest'
import { approvedTimeOffDays, hrRoleGroup } from '../lib/hr'
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
})

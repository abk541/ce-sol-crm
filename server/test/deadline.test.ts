import { describe, expect, it } from 'vitest'
import { opportunityDeadlineTimeMs } from '../src/deadline.js'

describe('opportunity deadline validation', () => {
  it('converts fixed business timezone labels', () => {
    expect(opportunityDeadlineTimeMs({
      dueDate: '2026-07-30',
      localTime: '1:00 PM',
      timezone: 'EDT',
    })).toBe(Date.parse('2026-07-30T17:00:00.000Z'))
  })

  it('converts IANA timezone labels using the date-specific offset', () => {
    expect(opportunityDeadlineTimeMs({
      dueDate: '2026-07-30',
      localTime: '13:00',
      timezone: 'America/New_York',
    })).toBe(Date.parse('2026-07-30T17:00:00.000Z'))
  })

  it('supports explicit UTC offsets', () => {
    expect(opportunityDeadlineTimeMs({
      dueDate: '2026-07-30',
      localTime: '13:00',
      timezone: 'UTC+03:30',
    })).toBe(Date.parse('2026-07-30T09:30:00.000Z'))
  })

  it('rejects incomplete or impossible dates and times', () => {
    expect(opportunityDeadlineTimeMs({
      dueDate: '2026-02-30',
      localTime: '13:00',
      timezone: 'UTC',
    })).toBeNull()
    expect(opportunityDeadlineTimeMs({
      dueDate: '2026-07-30',
      localTime: '25:00',
      timezone: 'UTC',
    })).toBeNull()
  })
})

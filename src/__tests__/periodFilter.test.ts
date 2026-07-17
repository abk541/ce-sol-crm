import { describe, expect, it } from 'vitest'
import { filterByPeriod, normalizePeriodDate, type Period } from '../components/shared/PeriodFilter'

const july: Period = {
  label: 'July 2026',
  from: '2026-07-01',
  to: '2026-07-31',
}

describe('dashboard period filtering', () => {
  it('normalizes ISO timestamps and human-readable dates before comparing them', () => {
    expect(normalizePeriodDate('2026-07-10T23:45:00.000Z')).toBe('2026-07-10')
    expect(normalizePeriodDate('July 10, 2026')).toBe('2026-07-10')
  })

  it('keeps only records whose metric date is inside the selected range', () => {
    expect(filterByPeriod('2026-07-01T00:00:00.000Z', july)).toBe(true)
    expect(filterByPeriod('2026-07-31', july)).toBe(true)
    expect(filterByPeriod('2026-08-01', july)).toBe(false)
  })

  it('does not leave undated or invalid records in a filtered dashboard', () => {
    expect(filterByPeriod(undefined, july)).toBe(false)
    expect(filterByPeriod('not-a-date', july)).toBe(false)
    expect(filterByPeriod(undefined, null)).toBe(true)
  })
})

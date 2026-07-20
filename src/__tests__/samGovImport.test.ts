import { describe, expect, it } from 'vitest'
import {
  applyScheduleFieldChange,
  formatOpportunityMoroccoDueDateTime,
  formatOpportunitySourceDueDateTime,
  timezoneCodeForDisplay,
} from '../pages/PipelinePage'
import {
  extractSamGovAgency,
  extractSamGovDeadlineTimezone,
  mapSamGovOpportunityToForm,
  parseSamGovOpportunityReference,
  parseSamGovDeadline,
} from '../lib/samGov'
import { formatMoroccoDueTime, formatTime12h, opportunityDeadlineTimeMs } from '../lib/timezone'

describe('SAM.gov import API calls', () => {
  it('parses a notice ID without constructing the secret-bearing API request in the browser', () => {
    const noticeId = '7f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c'
    expect(parseSamGovOpportunityReference(`https://sam.gov/opp/${noticeId}/view`))
      .toEqual({ noticeId })
  })

  it('parses a solicitation number from a SAM.gov search URL', () => {
    expect(parseSamGovOpportunityReference('https://sam.gov/search/?q=W912EP-26-R-0001'))
      .toEqual({ solicitationNumber: 'W912EP-26-R-0001' })
  })

  it('rejects non-SAM hosts before invoking the server proxy', () => {
    expect(() => parseSamGovOpportunityReference('https://example.com/search/?q=W912EP-26-R-0001'))
      .toThrow('Could not parse the SAM.gov URL')
  })

  it('rejects unparseable URLs before making an API call', () => {
    expect(() => parseSamGovOpportunityReference('https://sam.gov/opportunities'))
      .toThrow('Could not parse the SAM.gov URL')
  })

  it('preserves the original SAM.gov local time and timezone, and computes Morocco time separately', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Roof Anchor Testing',
      solicitationNumber: '36C26326Q0724',
      subtierName: 'Veterans Health Administration',
      departmentName: 'Department of Veterans Affairs',
      naicsCode: '541350',
      typeOfSetAside: 'SBA',
      responseDeadLine: '2026-05-27T10:00:00-05:00',
      placeOfPerformance: { city: { name: 'Iowa City' }, state: { code: 'IA' } },
    }, 'https://sam.gov/opp/example/view')

    // Agency/type
    expect(mapped.client).toBe('Veterans Health Administration')
    expect(mapped.type).toBeUndefined()

    // Original SAM.gov local time is preserved as-is (formatted 12h)
    expect(mapped.dueDate).toBe('2026-05-27')
    expect(mapped.localTime).toBe('10:00 AM')
    expect(mapped.timezone).toBe('America/Chicago')

    // Morocco equivalent computed from exact UTC offset (UTC 15:00 → Morocco 16:00 / 4:00 PM)
    expect(mapped.moroccoTime).toBe('4:00 PM')
    expect(mapped.moroccoDate).toBe('2026-05-27')
  })

  it('falls back to department when subtier is missing', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Test',
      solicitationNumber: 'ABC-123',
      departmentName: 'Department of Defense',
    }, 'https://sam.gov/opp/example/view')

    expect(mapped.client).toBe('Department of Defense')
  })

  it('extracts sub-tier from fullParentPathName when flat fields are absent', () => {
    expect(extractSamGovAgency({
      fullParentPathName: 'DEPARTMENT OF VETERANS AFFAIRS.VETERANS HEALTH ADMINISTRATION.IOWA CITY VA HEALTH CARE SYSTEM',
    })).toBe('VETERANS HEALTH ADMINISTRATION')
  })

  it('falls back to department portion of fullParentPathName when sub-tier portion is absent', () => {
    expect(extractSamGovAgency({
      fullParentPathName: 'DEPARTMENT OF DEFENSE',
    })).toBe('DEPARTMENT OF DEFENSE')
  })

  it('reads nested subTier.name / department.name objects', () => {
    expect(extractSamGovAgency({
      subTier: { name: 'Forest Service' },
      department: { name: 'Department of Agriculture' },
    })).toBe('Forest Service')

    expect(extractSamGovAgency({
      department: { name: 'Department of Agriculture' },
    })).toBe('Department of Agriculture')
  })

  it('reads bare string subTier / department fields', () => {
    expect(extractSamGovAgency({
      subTier: 'Naval Sea Systems Command',
      department: 'Department of Defense',
    })).toBe('Naval Sea Systems Command')
  })

  it('returns "Unknown" only when no recognisable field is present', () => {
    expect(extractSamGovAgency({})).toBe('Unknown')
    expect(extractSamGovAgency({ subtierName: '   ', departmentName: '' })).toBe('Unknown')
  })

  it('preserves original deadline and cross-midnight Morocco conversion correctly', () => {
    // 23:59 local on May 27 at -04:00 offset → UTC 03:59 May 28 → Morocco 04:59 May 28
    const result = parseSamGovDeadline('2026-05-27T23:59:00-04:00')
    expect(result.dueDate).toBe('2026-05-27')
    expect(result.localTime).toBe('11:59 PM')
    expect(result.timezone).toBe('America/New_York')
    expect(result.moroccoDate).toBe('2026-05-28')
    expect(result.moroccoTime).toBe('4:59 AM')
  })

  it('returns empty strings for missing deadline', () => {
    const result = parseSamGovDeadline(undefined)
    expect(result.dueDate).toBe('')
    expect(result.localTime).toBe('')
    expect(result.moroccoTime).toBe('')
  })

  it('maps a Z-offset (UTC) deadline to GMT timezone and Morocco +1h', () => {
    const result = parseSamGovDeadline('2026-06-01T14:00:00Z')
    expect(result.dueDate).toBe('2026-06-01')
    expect(result.localTime).toBe('2:00 PM')
    expect(result.timezone).toBe('UTC')
    expect(result.moroccoTime).toBe('3:00 PM')
    expect(result.moroccoDate).toBe('2026-06-01')
  })

  it('maps raw SAM.gov UTC offsets to real timezone names when no named timezone is provided', () => {
    expect(parseSamGovDeadline('2026-01-15T10:00:00-05:00').timezone).toBe('America/New_York')
    expect(parseSamGovDeadline('2026-07-15T10:00:00-04:00').timezone).toBe('America/New_York')
  })

  it('uses SAM.gov named deadline timezone fields when present', () => {
    expect(extractSamGovDeadlineTimezone({ responseDeadLineTimeZone: 'Central Daylight Time' })).toBe('America/Chicago')
    expect(parseSamGovDeadline('2026-07-15T10:00:00-05:00', 'America/Chicago').timezone).toBe('America/Chicago')
  })

  it('treats timezone abbreviations as fixed offsets, not browser daylight guesses', () => {
    const estDeadline = opportunityDeadlineTimeMs({
      dueDate: '2026-05-27',
      localTime: '10:00 AM',
      timezone: 'EST',
    })
    const edtDeadline = opportunityDeadlineTimeMs({
      dueDate: '2026-05-27',
      localTime: '10:00 AM',
      timezone: 'EDT',
    })

    expect(estDeadline).toBe(new Date('2026-05-27T15:00:00Z').getTime())
    expect(edtDeadline).toBe(new Date('2026-05-27T14:00:00Z').getTime())
    expect(formatMoroccoDueTime({
      dueDate: '2026-05-27',
      localTime: '10:00 AM',
      timezone: 'EST',
    })).toBe('4:00 PM GMT+1')
  })

  it('recomputes Morocco time when an imported local deadline time is edited', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Roof Anchor Testing',
      solicitationNumber: '36C26326Q0724',
      subtierName: 'Veterans Health Administration',
      responseDeadLine: '2026-05-27T10:00:00-04:00',
    }, 'https://sam.gov/opp/example/view')

    const changed = applyScheduleFieldChange(mapped, 'localTime', '11:30 AM')

    expect(changed.localTime).toBe('11:30 AM')
    expect(changed.timezone).toBe('America/New_York')
    expect(changed.moroccoTime).toBe('4:30 PM')
    expect(changed.moroccoDate).toBe('2026-05-27')
  })

  it('keeps Morocco recomputation exact after mapping raw offsets to timezone names', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Central Deadline',
      solicitationNumber: '36C26326Q0725',
      subtierName: 'Veterans Health Administration',
      responseDeadLine: '2026-05-27T10:00:00-05:00',
    }, 'https://sam.gov/opp/example/view')

    const changed = applyScheduleFieldChange(mapped, 'localTime', '11:00 AM')

    expect(mapped.timezone).toBe('America/Chicago')
    expect(changed.moroccoTime).toBe('5:00 PM')
    expect(changed.moroccoDate).toBe('2026-05-27')
  })

  it('recomputes Morocco time when the source timezone is edited', () => {
    const changed = applyScheduleFieldChange({
      dueDate: '2026-05-27',
      localTime: '10:00 AM',
      timezone: 'GMT+1',
      moroccoTime: '10:00 AM',
      moroccoDate: '2026-05-27',
    }, 'timezone', 'America/New_York')

    expect(changed.localTime).toBe('10:00 AM')
    expect(changed.dueDate).toBe('2026-05-27')
    expect(changed.timezone).toBe('America/New_York')
    expect(changed.moroccoTime).toBe('3:00 PM')
    expect(changed.moroccoDate).toBe('2026-05-27')
  })

  it('recomputes Morocco date when an imported due date edit crosses midnight', () => {
    const mapped = mapSamGovOpportunityToForm({
      title: 'Late Deadline',
      solicitationNumber: '36C26326Q0724',
      subtierName: 'Veterans Health Administration',
      responseDeadLine: '2026-05-27T23:30:00-04:00',
    }, 'https://sam.gov/opp/example/view')

    const changed = applyScheduleFieldChange(mapped, 'dueDate', '2026-05-28')

    expect(changed.dueDate).toBe('2026-05-28')
    expect(changed.moroccoTime).toBe('4:30 AM')
    expect(changed.moroccoDate).toBe('2026-05-29')
  })

  it('shows imported timezone values as short codes for the form dropdown', () => {
    expect(timezoneCodeForDisplay('America/New_York', new Date('2026-05-27T14:00:00Z'))).toBe('EDT')
    expect(timezoneCodeForDisplay('America/Chicago', new Date('2026-05-27T15:00:00Z'))).toBe('CDT')
    expect(timezoneCodeForDisplay('Africa/Casablanca', new Date('2026-05-27T12:00:00Z'))).toBe('GMT+1')
    expect(timezoneCodeForDisplay('Asia/Riyadh', new Date('2026-05-27T12:00:00Z'))).toBe('KSA')
  })

  it('formats the table source deadline without appending an empty time', () => {
    expect(formatOpportunitySourceDueDateTime({
      dueDate: '2026-05-28',
      localTime: '',
      timezone: 'EDT',
    })).toBe('May 28, 2026')
  })

  it('keeps the table source deadline on timezone codes and Morocco conversion stable', () => {
    const opp = {
      dueDate: '2026-05-28',
      localTime: '10:00 AM',
      timezone: 'America/New_York',
      moroccoTime: '3:00 PM',
      moroccoDate: '2026-05-28',
    }

    expect(formatOpportunitySourceDueDateTime(opp)).toBe('May 28, 2026 at 10:00 AM EDT')
    expect(formatOpportunityMoroccoDueDateTime(opp)).toBe('3:00 PM GMT+1')
  })

  it('uses stored Morocco import time if the source time is unavailable', () => {
    expect(formatOpportunityMoroccoDueDateTime({
      dueDate: '2026-05-28',
      localTime: '',
      timezone: 'America/New_York',
      moroccoTime: '3:00 PM',
      moroccoDate: '2026-05-28',
    })).toBe('3:00 PM GMT+1')
  })

  it('does not invent a Morocco conversion when no source time exists', () => {
    expect(formatOpportunityMoroccoDueDateTime({
      dueDate: '2026-05-28',
      localTime: '',
      timezone: 'America/New_York',
      moroccoTime: '',
      moroccoDate: '',
    })).toBe('')
  })

  it('normalises any clock-time variant into canonical 12h AM/PM', () => {
    expect(formatTime12h('10:00')).toBe('10:00 AM')      // 24h → 12h
    expect(formatTime12h('17:30')).toBe('5:30 PM')       // 24h → 12h
    expect(formatTime12h('00:15')).toBe('12:15 AM')      // midnight edge
    expect(formatTime12h('12:00')).toBe('12:00 PM')      // noon edge
    expect(formatTime12h('5:30PM')).toBe('5:30 PM')      // missing space
    expect(formatTime12h('5:30 pm')).toBe('5:30 PM')     // lowercase
    expect(formatTime12h('10:00 AM')).toBe('10:00 AM')   // already canonical
    expect(formatTime12h('')).toBe('')
  })
})

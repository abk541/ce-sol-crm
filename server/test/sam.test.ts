import { describe, expect, it } from 'vitest'
import { parseSamReference, sanitizeSecret } from '../src/sam.js'

describe('SAM.gov boundary', () => {
  it('accepts only an HTTPS SAM.gov host', () => {
    expect(parseSamReference('https://sam.gov/opp/0123456789abcdef0123456789abcdef/view')).toEqual({
      noticeId: '0123456789abcdef0123456789abcdef',
    })
    expect(() => parseSamReference('https://sam.gov.evil.example/opp/0123456789abcdef0123456789abcdef/view'))
      .toThrow(/SAM.gov URL/)
    expect(() => parseSamReference('http://sam.gov/opp/0123456789abcdef0123456789abcdef/view'))
      .toThrow(/SAM.gov URL/)
  })

  it('redacts the configured secret recursively', () => {
    expect(sanitizeSecret({ api_key: 'secret', message: 'bad secret', nested: ['secret'] }, 'secret')).toEqual({
      message: 'bad [redacted]',
      nested: ['[redacted]'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { parseSourcingComments, serializeSourcingComments, sourcingNotesText } from '../lib/sourcingComments'

describe('sourcing comments', () => {
  it('reads structured comment history without exposing JSON', () => {
    const raw = JSON.stringify([
      { id: 'comment-1', text: 'Quote requested', author: 'Team member', createdAt: '2026-07-20T10:00:00.000Z' },
      { id: 'comment-2', text: 'Quote received', author: 'Team member', createdAt: '2026-07-20T12:00:00.000Z' },
    ])

    expect(parseSourcingComments(raw).map(comment => comment.text)).toEqual(['Quote requested', 'Quote received'])
    expect(sourcingNotesText(raw)).toBe('Quote requested Quote received')
  })

  it('keeps legacy plain-text notes readable', () => {
    expect(parseSourcingComments('Call back tomorrow')).toMatchObject([
      { text: 'Call back tomorrow', author: 'Legacy note' },
    ])
  })

  it('drops blank entries when saving structured history', () => {
    const stored = serializeSourcingComments([
      { id: 'one', text: 'Useful note', author: 'User', createdAt: '2026-07-20' },
      { id: 'two', text: '   ', author: 'User', createdAt: '2026-07-20' },
    ])
    expect(JSON.parse(stored)).toHaveLength(1)
  })
})

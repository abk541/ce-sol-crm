import { describe, expect, it } from 'vitest'
import { contactsFromSourcingDraft, normalizeSourcingContacts } from '../lib/sourcingContacts'

describe('sourcing contacts', () => {
  it('preserves the primary contact title and notes when compact fields are edited', () => {
    const contacts = contactsFromSourcingDraft({
      contactName: 'Updated Name',
      email: 'updated@example.com',
      phone: '555-0100',
      contacts: [{
        id: 'contact-1',
        name: 'Original Name',
        title: 'Chief Estimator',
        email: 'old@example.com',
        phone: '555-0000',
        notes: 'Prefers email after 2 PM',
      }],
    })

    expect(contacts[0]).toEqual({
      id: 'contact-1',
      name: 'Updated Name',
      title: 'Chief Estimator',
      email: 'updated@example.com',
      phone: '555-0100',
      notes: 'Prefers email after 2 PM',
    })
  })

  it('normalizes whitespace without dropping title-only contacts', () => {
    expect(normalizeSourcingContacts([{
      id: 'contact-2',
      name: ' ',
      title: '  Procurement Lead  ',
      notes: '  Call first  ',
    }])).toEqual([{
      id: 'contact-2',
      name: '',
      title: 'Procurement Lead',
      email: undefined,
      phone: undefined,
      notes: 'Call first',
    }])
  })
})

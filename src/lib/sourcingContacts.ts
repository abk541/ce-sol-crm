import type { SubcontractorContact } from '../types'

export type SourcingContactDraft = {
  contactName: string
  email: string
  phone: string
  contacts: SubcontractorContact[]
}

function contactId(index: number): string {
  return crypto.randomUUID?.() || `contact-${index}`
}

export function normalizeSourcingContacts(contacts?: SubcontractorContact[]): SubcontractorContact[] {
  return (contacts ?? [])
    .map((contact, index) => ({
      id: contact.id || contactId(index),
      name: (contact.name ?? '').trim(),
      title: contact.title?.trim() || undefined,
      email: contact.email?.trim() || undefined,
      phone: contact.phone?.trim() || undefined,
      notes: contact.notes?.trim() || undefined,
    }))
    .filter(contact => contact.name || contact.email || contact.phone || contact.title || contact.notes)
}

export function contactsFromSourcingDraft(draft: SourcingContactDraft): SubcontractorContact[] {
  const contacts = normalizeSourcingContacts(draft.contacts)
  const existingPrimary = contacts[0]
  const primary: SubcontractorContact | null = draft.contactName || draft.email || draft.phone
    ? {
        // The compact primary-contact fields edit only name/email/phone. Keep
        // title and notes that are managed in the expanded contacts editor.
        ...existingPrimary,
        id: existingPrimary?.id || contactId(0),
        name: draft.contactName.trim(),
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
      }
    : null
  if (!primary) return contacts
  const [, ...rest] = contacts
  return normalizeSourcingContacts([primary, ...rest])
}

import { describe, expect, it } from 'vitest'
import {
  buildLegacyContractFromDraft,
  contractCreationValidationError,
  emptyLegacyContractDraft,
  hasDuplicateHumanContractId,
} from '../lib/contractCreation'
import type { Contract } from '../types'

function validDraft() {
  return {
    ...emptyLegacyContractDraft(),
    title: 'Legacy Facilities Award',
    contractId: ' FA4890-26-C-0012 ',
    contractNumber: ' W91-LEGACY-12 ',
    client: ' Department of the Air Force ',
    naicsCode: ' 561210 ',
    location: ' Joint Base Andrews, MD ',
    popStart: '2025-10-01',
    popEnd: '2027-09-30',
    value: '1250000.50',
    baseAmount: '600000',
    monthlyPayment: '52083.33',
    optionYears: '2',
    optionYearDeadline: '2026-08-01',
    billingNotes: ' Imported from the legacy award register. ',
  }
}

function validContract(): Omit<Contract, 'id'> {
  const built = buildLegacyContractFromDraft(validDraft())
  if (!built.ok) throw new Error(built.message)
  return built.contract
}

describe('legacy contract creation validation', () => {
  it('builds a normalized contract without requiring an opportunity', () => {
    const built = buildLegacyContractFromDraft(validDraft())

    expect(built).toEqual({
      ok: true,
      contract: expect.objectContaining({
        title: 'Legacy Facilities Award',
        contractId: 'FA4890-26-C-0012',
        contractNumber: 'W91-LEGACY-12',
        client: 'Department of the Air Force',
        naicsCode: '561210',
        location: 'Joint Base Andrews, MD',
        type: 'OTJ',
        status: 'ACTIVE',
        popStart: '2025-10-01',
        popEnd: '2027-09-30',
        value: 1_250_000.5,
        baseAmount: 600_000,
        monthlyPayment: 52_083.33,
        optionYears: 2,
        optionYearDeadline: '2026-08-01',
        billingNotes: 'Imported from the legacy award register.',
        spm: '',
        pm: '',
      }),
    })
    if (built.ok) expect(built.contract.opportunityId).toBeUndefined()
  })

  it('requires identity, valid POP dates, and a non-negative total value', () => {
    expect(buildLegacyContractFromDraft({ ...validDraft(), title: '' })).toEqual({
      ok: false,
      message: 'Contract title is required.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), contractId: ' ' })).toEqual({
      ok: false,
      message: 'Contract ID is required.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), popEnd: '2025-09-30' })).toEqual({
      ok: false,
      message: 'POP end date cannot be before the start date.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), popStart: '2025-02-30' })).toEqual({
      ok: false,
      message: 'A valid POP start and end date are required.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), value: '-0.01' })).toEqual({
      ok: false,
      message: 'Total contract value must be a non-negative number.',
    })
  })

  it('rejects invalid optional amounts, fractional option years, type, and status', () => {
    expect(buildLegacyContractFromDraft({ ...validDraft(), baseAmount: 'NaN' })).toEqual({
      ok: false,
      message: 'Base amount must be a non-negative number.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), monthlyPayment: '-1' })).toEqual({
      ok: false,
      message: 'Monthly payment must be a non-negative number.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), optionYears: '1.5' })).toEqual({
      ok: false,
      message: 'Option years must be a non-negative whole number.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), type: 'INVALID' as Contract['type'] })).toEqual({
      ok: false,
      message: 'Choose a valid contract type.',
    })
    expect(buildLegacyContractFromDraft({ ...validDraft(), status: 'INVALID' as Contract['status'] })).toEqual({
      ok: false,
      message: 'Choose a valid contract status.',
    })
  })

  it('detects duplicate human IDs case-insensitively after trimming whitespace', () => {
    expect(hasDuplicateHumanContractId(
      [{ contractId: 'FA4890-26-C-0012' }],
      '  fa4890-26-c-0012  ',
    )).toBe(true)
    expect(hasDuplicateHumanContractId(
      [{ contractId: 'FA4890-26-C-0012' }],
      'FA4890-26-C-0013',
    )).toBe(false)
  })

  it('validates store-level numeric semantics for direct callers', () => {
    expect(contractCreationValidationError({
      ...validContract(),
      value: Number.POSITIVE_INFINITY,
    })).toBe('Total contract value must be a non-negative number.')
    expect(contractCreationValidationError({
      ...validContract(),
      optionYears: -1,
    })).toBe('Option years must be a non-negative whole number.')
  })
})

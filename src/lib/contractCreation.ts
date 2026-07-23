import type {
  Contract,
  ContractFinanceType,
  ContractStatus,
  ContractType,
  SetAside,
} from '../types'

export const CONTRACT_TYPE_OPTIONS: readonly ContractType[] = [
  'OTJ',
  'RECURRING',
  'BPA',
  'IDIQ',
  'S&D',
  'SUPPLY',
]

export const CONTRACT_STATUS_OPTIONS: readonly ContractStatus[] = [
  'KICK_OFF',
  'LOCKING_SUB',
  'ACTIVE',
  'ON_GOING',
  'PERFORMING',
  'PENDING_PAYMENT',
  'ARCHIVED',
  'TERMINATED',
  'CANCELED',
]

export const CONTRACT_FINANCE_TYPE_OPTIONS: readonly ContractFinanceType[] = [
  'FFP',
  'T&M',
  'CPFF',
  'OTHER',
]

export const CONTRACT_SET_ASIDE_OPTIONS: readonly SetAside[] = [
  'SB',
  'SDVOSB',
  'WOSB',
  'HUBZone',
  'VOSB',
  '8(a)',
  'UNRES',
]

export interface LegacyContractDraft {
  title: string
  contractId: string
  contractNumber: string
  client: string
  naicsCode: string
  location: string
  type: ContractType
  status: ContractStatus
  financeType: ContractFinanceType | ''
  setAside: SetAside | ''
  popStart: string
  popEnd: string
  value: string
  baseAmount: string
  monthlyPayment: string
  optionYears: string
  optionYearDeadline: string
  assignedTo: string
  billingNotes: string
}

export type LegacyContractBuildResult =
  | { ok: true; contract: Omit<Contract, 'id'> }
  | { ok: false; message: string }

export function emptyLegacyContractDraft(): LegacyContractDraft {
  return {
    title: '',
    contractId: '',
    contractNumber: '',
    client: '',
    naicsCode: '',
    location: '',
    type: 'OTJ',
    status: 'ACTIVE',
    financeType: '',
    setAside: '',
    popStart: '',
    popEnd: '',
    value: '',
    baseAmount: '',
    monthlyPayment: '',
    optionYears: '',
    optionYearDeadline: '',
    assignedTo: '',
    billingNotes: '',
  }
}

export function normalizeHumanContractId(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function hasDuplicateHumanContractId(
  contracts: readonly Pick<Contract, 'contractId'>[],
  candidate: string,
): boolean {
  const normalized = normalizeHumanContractId(candidate)
  return normalized.length > 0
    && contracts.some(contract => normalizeHumanContractId(contract.contractId) === normalized)
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function optionalNonNegativeNumberError(value: number | undefined, label: string): string | null {
  if (value === undefined) return null
  return Number.isFinite(value) && value >= 0
    ? null
    : `${label} must be a non-negative number.`
}

export function normalizeContractForCreation(
  contract: Omit<Contract, 'id'>,
): Omit<Contract, 'id'> {
  const trimOptional = (value?: string) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  }

  return {
    ...contract,
    title: contract.title.trim(),
    contractId: contract.contractId.trim().replace(/\s+/g, ' '),
    contractNumber: trimOptional(contract.contractNumber),
    client: trimOptional(contract.client),
    naicsCode: contract.naicsCode.trim(),
    location: contract.location.trim(),
    popStart: contract.popStart.trim(),
    popEnd: contract.popEnd.trim(),
    spm: contract.spm.trim(),
    pm: contract.pm.trim(),
    bds: trimOptional(contract.bds),
    bdm: trimOptional(contract.bdm),
    supportAgent: trimOptional(contract.supportAgent),
    billingNotes: trimOptional(contract.billingNotes),
    optionYearDeadline: trimOptional(contract.optionYearDeadline),
    assignedTo: trimOptional(contract.assignedTo),
    opportunityId: trimOptional(contract.opportunityId),
  }
}

export function contractCreationValidationError(
  contract: Omit<Contract, 'id'>,
): string | null {
  if (!contract.title.trim()) return 'Contract title is required.'
  if (!contract.contractId.trim()) return 'Contract ID is required.'
  if (!CONTRACT_TYPE_OPTIONS.includes(contract.type)) return 'Choose a valid contract type.'
  if (!CONTRACT_STATUS_OPTIONS.includes(contract.status)) return 'Choose a valid contract status.'
  if (contract.financeType && !CONTRACT_FINANCE_TYPE_OPTIONS.includes(contract.financeType)) {
    return 'Choose a valid finance type.'
  }
  if (contract.setAside && !CONTRACT_SET_ASIDE_OPTIONS.includes(contract.setAside)) {
    return 'Choose a valid set-aside.'
  }
  if (!isValidIsoDate(contract.popStart) || !isValidIsoDate(contract.popEnd)) {
    return 'A valid POP start and end date are required.'
  }
  if (contract.popEnd < contract.popStart) {
    return 'POP end date cannot be before the start date.'
  }
  if (!Number.isFinite(contract.value) || contract.value < 0) {
    return 'Total contract value must be a non-negative number.'
  }

  const baseAmountError = optionalNonNegativeNumberError(contract.baseAmount, 'Base amount')
  if (baseAmountError) return baseAmountError
  const monthlyPaymentError = optionalNonNegativeNumberError(contract.monthlyPayment, 'Monthly payment')
  if (monthlyPaymentError) return monthlyPaymentError

  if (
    contract.optionYears !== undefined
    && (!Number.isFinite(contract.optionYears)
      || contract.optionYears < 0
      || !Number.isInteger(contract.optionYears))
  ) {
    return 'Option years must be a non-negative whole number.'
  }

  if (contract.optionYearDeadline && !isValidIsoDate(contract.optionYearDeadline)) {
    return 'Choose a valid option-year deadline.'
  }

  return null
}

type NumberParseResult = { ok: true; value: number | undefined } | { ok: false; error: string }

function parseRequiredNonNegativeNumber(raw: string, label: string): NumberParseResult {
  if (!raw.trim()) return { ok: false, error: `${label} is required.` }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${label} must be a non-negative number.` }
  }
  return { ok: true, value }
}

function parseOptionalNonNegativeNumber(raw: string, label: string): NumberParseResult {
  if (!raw.trim()) return { ok: true, value: undefined }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${label} must be a non-negative number.` }
  }
  return { ok: true, value }
}

export function buildLegacyContractFromDraft(
  draft: LegacyContractDraft,
): LegacyContractBuildResult {
  if (!draft.title.trim()) return { ok: false, message: 'Contract title is required.' }
  if (!draft.contractId.trim()) return { ok: false, message: 'Contract ID is required.' }
  if (!CONTRACT_TYPE_OPTIONS.includes(draft.type)) {
    return { ok: false, message: 'Choose a valid contract type.' }
  }
  if (!CONTRACT_STATUS_OPTIONS.includes(draft.status)) {
    return { ok: false, message: 'Choose a valid contract status.' }
  }
  if (!isValidIsoDate(draft.popStart) || !isValidIsoDate(draft.popEnd)) {
    return { ok: false, message: 'A valid POP start and end date are required.' }
  }
  if (draft.popEnd < draft.popStart) {
    return { ok: false, message: 'POP end date cannot be before the start date.' }
  }

  const value = parseRequiredNonNegativeNumber(draft.value, 'Total contract value')
  if (!value.ok) return { ok: false, message: value.error }

  const baseAmount = parseOptionalNonNegativeNumber(draft.baseAmount, 'Base amount')
  if (!baseAmount.ok) return { ok: false, message: baseAmount.error }

  const monthlyPayment = parseOptionalNonNegativeNumber(draft.monthlyPayment, 'Monthly payment')
  if (!monthlyPayment.ok) return { ok: false, message: monthlyPayment.error }

  const optionYears = parseOptionalNonNegativeNumber(draft.optionYears, 'Option years')
  if (!optionYears.ok) return { ok: false, message: optionYears.error }
  if (optionYears.value !== undefined && !Number.isInteger(optionYears.value)) {
    return { ok: false, message: 'Option years must be a non-negative whole number.' }
  }

  const contract = normalizeContractForCreation({
    title: draft.title,
    contractId: draft.contractId,
    contractNumber: draft.contractNumber || undefined,
    client: draft.client || undefined,
    naicsCode: draft.naicsCode,
    location: draft.location,
    type: draft.type,
    status: draft.status,
    financeType: draft.financeType || undefined,
    setAside: draft.setAside || undefined,
    popStart: draft.popStart,
    popEnd: draft.popEnd,
    value: value.value as number,
    baseAmount: baseAmount.value,
    monthlyPayment: monthlyPayment.value,
    optionYears: optionYears.value,
    optionYearDeadline: draft.optionYearDeadline || undefined,
    assignedTo: draft.assignedTo || undefined,
    billingNotes: draft.billingNotes || undefined,
    spm: '',
    pm: '',
  })
  const error = contractCreationValidationError(contract)
  return error
    ? { ok: false, message: error }
    : { ok: true, contract }
}

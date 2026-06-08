import type { Contract } from '../types'
import {
  canGenerateContractInvoice,
  invoiceAmountForContract,
  subkMonthlyBillingRowsForContract,
  subkQuoteSummaryForContract,
} from './invoicePdf'

export function isFinanceProjectionContract(contract: Contract) {
  return !['ARCHIVED', 'TERMINATED'].includes(contract.status)
}

export function subkSpendForContract(contract: Contract) {
  return (contract.lockedSubcontractors || []).reduce((sum, sub) => {
    const rate = sub.paymentRate
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? sum + rate : sum
  }, 0)
}

// Subk due date = invoice start (serviceDate, else popStart) + 30 days, returned as YYYY-MM-DD.
export function subkDueDateForContract(contract: Contract): string | undefined {
  const start = (contract.serviceDate || contract.popStart || '').trim()
  if (!start) return undefined
  const d = new Date(`${start}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function getFinanceProjectionSummary(contracts: Contract[]) {
  const activeContracts = contracts.filter(isFinanceProjectionContract)
  const otjContracts = activeContracts.filter(contract => contract.type === 'OTJ')
  const recurringContracts = activeContracts.filter(contract => contract.type === 'RECURRING')

  const projectedInvoiceTotal = activeContracts.reduce((sum, c) => sum + invoiceAmountForContract(c), 0)
  const projectedSubkSpend = activeContracts.reduce((sum, c) => sum + subkSpendForContract(c), 0)

  return {
    activeContracts,
    otjContracts,
    recurringContracts,
    otjTotal: otjContracts.reduce((sum, contract) => sum + (contract.value || 0), 0),
    recurringMonthly: recurringContracts.reduce((sum, contract) => sum + (contract.monthlyPayment || 0), 0),
    projectedInvoiceTotal,
    projectedSubkSpend,
    projectedNetProfit: projectedInvoiceTotal - projectedSubkSpend,
  }
}

export function getFinanceProjectionRow(contract: Contract) {
  const isRecurring = contract.type === 'RECURRING'
  const invoiceAmount = invoiceAmountForContract(contract)
  const subkSpend = subkSpendForContract(contract)
  return {
    isRecurring,
    invoiceReady: canGenerateContractInvoice(contract),
    invoiceAmount,
    subkSpend,
    profit: invoiceAmount - subkSpend,
    subkDueDate: subkDueDateForContract(contract),
    subkRows: isRecurring
      ? subkMonthlyBillingRowsForContract(contract)
      : [subkQuoteSummaryForContract(contract)],
  }
}


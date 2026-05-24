import type { Contract } from '../types'
import {
  canGenerateContractInvoice,
  invoiceAmountForContract,
  subkMonthlyBillingRowsForContract,
  subkQuoteSummaryForContract,
} from './invoicePdf'

export function isFinanceProjectionContract(contract: Contract) {
  return !['ARCHIVED', 'TERMINATED', 'CANCELED'].includes(contract.status)
}

export function getFinanceProjectionSummary(contracts: Contract[]) {
  const activeContracts = contracts.filter(isFinanceProjectionContract)
  const otjContracts = activeContracts.filter(contract => contract.type === 'OTJ')
  const recurringContracts = activeContracts.filter(contract => contract.type === 'RECURRING')

  return {
    activeContracts,
    otjContracts,
    recurringContracts,
    otjTotal: otjContracts.reduce((sum, contract) => sum + (contract.value || 0), 0),
    recurringMonthly: recurringContracts.reduce((sum, contract) => sum + (contract.monthlyPayment || 0), 0),
    projectedInvoiceTotal: activeContracts.reduce((sum, contract) => sum + invoiceAmountForContract(contract), 0),
  }
}

export function getFinanceProjectionRow(contract: Contract) {
  const isRecurring = contract.type === 'RECURRING'
  return {
    isRecurring,
    invoiceReady: canGenerateContractInvoice(contract),
    invoiceAmount: invoiceAmountForContract(contract),
    subkRows: isRecurring
      ? subkMonthlyBillingRowsForContract(contract)
      : [subkQuoteSummaryForContract(contract)],
  }
}


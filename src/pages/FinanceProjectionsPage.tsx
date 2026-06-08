import { DollarSign, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type { Contract } from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractInvoicePdf } from '../lib/invoicePdf'
import { getFinanceProjectionRow, getFinanceProjectionSummary } from '../lib/financeProjections'

async function generateInvoiceFile(contract: Contract, invoiceNumber?: number) {
  try {
    await generateContractInvoicePdf(contract, { invoiceNumber })
    toast.success(
      invoiceNumber
        ? `Invoice INV-${String(invoiceNumber).padStart(4, '0')} generated`
        : 'Invoice PDF generated'
    )
  } catch (err) {
    console.error(err)
    toast.error(contract.type === 'OTJ'
      ? 'OTJ invoices can only be generated in Pending Payment.'
      : 'Could not generate invoice PDF.')
  }
}

export default function FinanceProjectionsPage() {
  const { contracts, consumeInvoiceNumber } = useStore()
  const {
    activeContracts,
    otjContracts,
    recurringContracts,
    otjTotal,
    recurringMonthly,
    projectedInvoiceTotal,
  } = getFinanceProjectionSummary(contracts)

  return (
    <div className="p-6 page-enter space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Finance</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
              <DollarSign size={22} className="text-emerald-500" /> Finance Projections
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Active-contract billing view. OTJ invoices use total contract value; recurring invoices use monthly value.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            { label: 'OTJ Total Contract Value', value: formatCurrency(otjTotal), sub: `${otjContracts.length} OTJ contracts` },
            { label: 'Recurring Monthly Gov Billing', value: formatCurrency(recurringMonthly), sub: `${recurringContracts.length} recurring contracts` },
            { label: 'Next Invoice Batch', value: formatCurrency(projectedInvoiceTotal), sub: 'OTJ total + recurring monthly' },
          ].map(card => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xl font-black text-slate-900">{card.value}</p>
              <p className="mt-1 text-xs font-bold text-slate-600">{card.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{card.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Type</th>
                <th>Government Billing</th>
                <th>Subk Row</th>
                <th>Invoice Return</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No active contracts available for finance projections.
                  </td>
                </tr>
              )}
              {activeContracts.map(contract => {
                const { isRecurring, invoiceReady, invoiceAmount, subkRows } = getFinanceProjectionRow(contract)
                return (
                  <tr key={contract.id}>
                    <td className="max-w-[260px]">
                      <p className="truncate text-xs font-bold text-slate-800" title={contract.title}>{contract.title}</p>
                      <p className="text-[10px] font-mono text-slate-400">{contract.contractId}</p>
                    </td>
                    <td>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {isRecurring ? 'Recurring' : contract.type}
                      </span>
                    </td>
                    <td className="text-xs text-slate-700">
                      {isRecurring ? (
                        <div>
                          <p><span className="font-bold">Monthly Payment (Gov):</span> {formatCurrency(contract.monthlyPayment || 0)}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">Total contract value: {formatCurrency(contract.value || 0)}</p>
                        </div>
                      ) : (
                        <p><span className="font-bold">Total Contract Value:</span> {formatCurrency(contract.value || 0)}</p>
                      )}
                    </td>
                    <td className="max-w-[360px] text-xs text-slate-600">
                      {subkRows.map((row, index) => (
                        <p key={`${contract.id}-${index}`} className="truncate" title={row}>
                          <span className="font-bold">{isRecurring ? 'Monthly Billing (Subk)' : "Quote (Subk's)"}:</span> {row}
                        </p>
                      ))}
                    </td>
                    <td className="whitespace-nowrap text-xs font-black text-emerald-600">
                      {formatCurrency(invoiceAmount)}
                      <p className="text-[10px] font-semibold text-slate-400">{isRecurring ? 'per month' : 'total value'}</p>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => generateInvoiceFile(contract, consumeInvoiceNumber())}
                        disabled={!invoiceReady}
                        title={!invoiceReady ? 'OTJ invoices are generated when the contract reaches Pending Payment.' : 'Generate invoice PDF'}
                        className="btn-primary gap-1 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Download size={11} /> Generate Invoice
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

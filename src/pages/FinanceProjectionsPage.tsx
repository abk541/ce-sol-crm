import { DollarSign, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type { Contract, GovBillingStatus } from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractInvoicePdf } from '../lib/invoicePdf'
import { getFinanceProjectionRow, getFinanceProjectionSummary } from '../lib/financeProjections'

const GOV_STATUS_OPTIONS: { value: GovBillingStatus | ''; label: string }[] = [
  { value: '', label: '— Not set —' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'BILLED', label: 'Billed' },
  { value: 'SENT_FOR_APPROVAL', label: 'Sent for approval' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PAID', label: 'Paid' },
]

const GOV_STATUS_BADGE: Record<GovBillingStatus, { bg: string; text: string }> = {
  SUBMITTED:         { bg: 'bg-sky-100',     text: 'text-sky-700' },
  BILLED:            { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  SENT_FOR_APPROVAL: { bg: 'bg-amber-100',   text: 'text-amber-700' },
  REJECTED:          { bg: 'bg-rose-100',    text: 'text-rose-700' },
  PAID:              { bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

function fmtDateMDY(iso?: string) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

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
  const { contracts, consumeInvoiceNumber, updateContract } = useStore()
  const {
    activeContracts,
    otjContracts,
    recurringContracts,
    otjTotal,
    recurringMonthly,
    projectedInvoiceTotal,
    projectedSubkSpend,
    projectedNetProfit,
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

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">What we make</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{formatCurrency(projectedInvoiceTotal)}</p>
            <p className="mt-0.5 text-[11px] text-emerald-700/70">Government billing across active contracts</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">What we spend</p>
            <p className="mt-1 text-2xl font-black text-rose-900">{formatCurrency(projectedSubkSpend)}</p>
            <p className="mt-0.5 text-[11px] text-rose-700/70">Subcontractor pay rates on active contracts</p>
          </div>
          <div
            className={`rounded-2xl border p-4 ${
              projectedNetProfit >= 0 ? 'border-slate-300 bg-slate-900 text-white' : 'border-rose-300 bg-rose-100'
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${projectedNetProfit >= 0 ? 'text-slate-300' : 'text-rose-700'}`}>
              Net profit
            </p>
            <p className={`mt-1 text-2xl font-black ${projectedNetProfit >= 0 ? 'text-white' : 'text-rose-900'}`}>
              {formatCurrency(projectedNetProfit)}
            </p>
            <p className={`mt-0.5 text-[11px] ${projectedNetProfit >= 0 ? 'text-slate-400' : 'text-rose-700/70'}`}>
              Make − Spend
            </p>
          </div>
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
                <th>Profit</th>
                <th>Gov Status</th>
                <th>Subk Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                    No active contracts available for finance projections.
                  </td>
                </tr>
              )}
              {activeContracts.map(contract => {
                const { isRecurring, invoiceReady, invoiceAmount, subkRows, subkSpend, profit, subkDueDate } = getFinanceProjectionRow(contract)
                const status = contract.governmentBillingStatus
                const badge = status ? GOV_STATUS_BADGE[status] : null
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
                      {subkSpend > 0 && (
                        <p className="mt-0.5 text-[10px] font-semibold text-rose-600">
                          Subk spend: {formatCurrency(subkSpend)}{isRecurring ? ' / mo' : ''}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs font-black text-emerald-600">
                      {formatCurrency(invoiceAmount)}
                      <p className="text-[10px] font-semibold text-slate-400">{isRecurring ? 'per month' : 'total value'}</p>
                    </td>
                    <td className={`whitespace-nowrap text-xs font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(profit)}
                      <p className="text-[10px] font-semibold text-slate-400">
                        {invoiceAmount > 0 ? `${Math.round((profit / invoiceAmount) * 100)}% margin` : '—'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap">
                      <select
                        value={status || ''}
                        onChange={e => {
                          const next = e.target.value as GovBillingStatus | ''
                          updateContract(contract.id, { governmentBillingStatus: next || undefined })
                        }}
                        className={`rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold focus:border-indigo-400 focus:outline-none ${badge ? `${badge.bg} ${badge.text}` : 'bg-white text-slate-600'}`}
                      >
                        {GOV_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap text-xs text-slate-700">
                      <p className="font-bold">{fmtDateMDY(subkDueDate)}</p>
                      <p className="text-[10px] text-slate-400">Invoice start + 30d</p>
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

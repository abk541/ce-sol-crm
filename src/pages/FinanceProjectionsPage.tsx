import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { DollarSign, Download, X, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type { Contract, GovBillingStatus } from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractInvoicePdf } from '../lib/invoicePdf'
import { getFinanceProjectionRow, getFinanceProjectionSummary, subkSpendForContract } from '../lib/financeProjections'

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

// ── Detail modal shell (portal + AnimatePresence per project rules) ──
function DetailModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="finance-detail-modal"
          className="fixed inset-0 z-[51] flex items-center justify-center p-2 sm:p-4"
          style={{ pointerEvents: 'none' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', pointerEvents: 'all' }}
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ maxHeight: 'min(92vh, 860px)', pointerEvents: 'all' }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Finance</p>
                <h2 className="mt-0.5 text-base font-black text-slate-900">{title}</h2>
                {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ml-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Revenue detail (editable) ─────────────────────────────────────────
function RevenueDetailModal({
  contract,
  onClose,
}: {
  contract: Contract
  onClose: () => void
}) {
  const { updateContract } = useStore()
  const isRecurring = contract.type === 'RECURRING'
  const [valueDraft, setValueDraft] = useState(contract.value != null ? String(contract.value) : '')
  const [monthlyDraft, setMonthlyDraft] = useState(contract.monthlyPayment != null ? String(contract.monthlyPayment) : '')

  const save = () => {
    const patch: Partial<Contract> = {}
    const valNum = Number(valueDraft)
    if (valueDraft.trim() !== '' && Number.isFinite(valNum) && valNum >= 0) patch.value = valNum
    if (isRecurring) {
      const monNum = Number(monthlyDraft)
      if (monthlyDraft.trim() !== '' && Number.isFinite(monNum) && monNum >= 0) patch.monthlyPayment = monNum
    }
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }
    updateContract(contract.id, patch)
    toast.success('Revenue updated')
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Projected revenue</p>
        <p className="mt-1 text-2xl font-black text-emerald-900">
          {formatCurrency(isRecurring ? (contract.monthlyPayment || 0) : (contract.value || 0))}
          <span className="ml-1 text-xs font-bold text-emerald-700/70">{isRecurring ? '/ month' : 'total'}</span>
        </p>
        <p className="mt-1 text-[11px] text-emerald-700/80">
          {isRecurring
            ? 'Recurring contracts bill the government monthly. Edit the monthly payment below.'
            : 'OTJ contracts bill the full contract value once. Edit the total value below.'}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Total contract value</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={valueDraft}
            onChange={e => setValueDraft(e.target.value)}
            className="input-field mt-1 w-full"
          />
        </div>
        {isRecurring && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Monthly payment (gov)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={monthlyDraft}
              onChange={e => setMonthlyDraft(e.target.value)}
              className="input-field mt-1 w-full"
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-bold text-slate-700">Why this number</p>
        <p className="mt-1">
          Revenue per row is what the government pays us per invoice cycle:
          {' '}<span className="font-bold">monthly payment</span> for recurring contracts,
          {' '}<span className="font-bold">total value</span> for OTJ contracts.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} className="btn-primary">Save changes</button>
      </div>
    </div>
  )
}

// ── Subk cost detail (editable per subk) ──────────────────────────────
function SubkCostDetailBody({
  contract,
  onClose,
}: {
  contract: Contract
  onClose: () => void
}) {
  const { updateLockedSubcontractor } = useStore()
  const isRecurring = contract.type === 'RECURRING'
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    ;(contract.lockedSubcontractors || []).forEach(sub => {
      seed[sub.id] = sub.paymentRate != null ? String(sub.paymentRate) : ''
    })
    return seed
  })

  const totalLive = (contract.lockedSubcontractors || []).reduce((sum, sub) => {
    const draft = drafts[sub.id]
    const parsed = draft != null && draft !== '' ? Number(draft) : sub.paymentRate
    return sum + (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : 0)
  }, 0)

  const setDraft = (id: string, val: string) => setDrafts(prev => ({ ...prev, [id]: val }))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">Subcontractor cost</p>
        <p className="mt-1 text-2xl font-black text-rose-900">
          {formatCurrency(totalLive)}
          <span className="ml-1 text-xs font-bold text-rose-700/70">{isRecurring ? '/ month' : 'total'}</span>
        </p>
        <p className="mt-1 text-[11px] text-rose-700/80">
          Sum of locked subcontractor pay rates. Edit a row below to update what each subk costs us.
        </p>
      </div>

      {(contract.lockedSubcontractors || []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No locked subcontractors yet. Lock subks from Contract Admin → Locked Subk to record costs here.
        </p>
      ) : (
        <div className="space-y-2">
          {(contract.lockedSubcontractors || []).map(sub => {
            const draft = drafts[sub.id] ?? ''
            return (
              <div key={sub.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{sub.companyName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {sub.contactName || '—'}{sub.email ? ` · ${sub.email}` : ''}
                    </p>
                  </div>
                  {sub.paid && (
                    <span className="flex-shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Paid
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft}
                    onChange={e => setDraft(sub.id, e.target.value)}
                    placeholder="0.00"
                    className="input-field flex-1 min-w-[140px] no-spin"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {isRecurring ? 'per month' : 'one-time'}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      const trimmed = draft.trim()
                      const parsed = Number(trimmed)
                      const nextRate = trimmed === '' ? undefined : (Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined)
                      updateLockedSubcontractor(contract.id, sub.id, { paymentRate: nextRate })
                      toast.success(nextRate != null ? `Pay rate saved for ${sub.companyName}` : 'Pay rate cleared')
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-primary">Done</button>
      </div>
    </div>
  )
}

// ── Profit detail (read-only breakdown) ───────────────────────────────
function ProfitDetailBody({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const isRecurring = contract.type === 'RECURRING'
  const revenue = isRecurring ? (contract.monthlyPayment || 0) : (contract.value || 0)
  const cost = subkSpendForContract(contract)
  const profit = revenue - cost
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Profit formula</p>
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-bold text-emerald-700">Revenue</span>
          {' − '}
          <span className="font-bold text-rose-700">Subcontractor cost</span>
          {' = '}
          <span className="font-bold text-slate-900">Profit</span>
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Revenue</p>
            <p className="text-[11px] text-emerald-700/70">
              {isRecurring ? 'Monthly government payment' : 'Total contract value'}
            </p>
          </div>
          <p className="text-lg font-black text-emerald-900">{formatCurrency(revenue)}</p>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Subcontractor cost</p>
            <p className="text-[11px] text-rose-700/70">
              {(contract.lockedSubcontractors || []).length} locked subk(s)
            </p>
          </div>
          <p className="text-lg font-black text-rose-900">−{formatCurrency(cost)}</p>
        </div>
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${profit >= 0 ? 'border-slate-300 bg-slate-900 text-white' : 'border-rose-300 bg-rose-100'}`}>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${profit >= 0 ? 'text-slate-300' : 'text-rose-700'}`}>Profit</p>
            <p className={`text-[11px] ${profit >= 0 ? 'text-slate-400' : 'text-rose-700/70'}`}>
              {revenue > 0 ? `${margin.toFixed(1)}% margin` : 'No revenue recorded'}
            </p>
          </div>
          <p className={`text-lg font-black ${profit >= 0 ? 'text-white' : 'text-rose-900'}`}>{formatCurrency(profit)}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Edit revenue or subcontractor cost from the corresponding cell on the projection row to update this breakdown.
      </p>

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onClose} className="btn-primary">Close</button>
      </div>
    </div>
  )
}

// ── Clickable money cell ──────────────────────────────────────────────
function MoneyCell({
  amount,
  unitLabel,
  tone,
  onClick,
}: {
  amount: number
  unitLabel: string
  tone: 'revenue' | 'cost' | 'profit-pos' | 'profit-neg'
  onClick: () => void
}) {
  const toneClasses = {
    'revenue':    'text-emerald-600 hover:bg-emerald-50',
    'cost':       'text-rose-600 hover:bg-rose-50',
    'profit-pos': 'text-emerald-700 hover:bg-emerald-50',
    'profit-neg': 'text-rose-700 hover:bg-rose-50',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full flex-col items-start rounded-md px-2 py-1 text-left transition-all ${toneClasses}`}
      title="Click to view details"
    >
      <span className="flex items-center gap-1 whitespace-nowrap text-xs font-black">
        {formatCurrency(amount)}
        <ChevronRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="text-[10px] font-semibold text-slate-400">{unitLabel}</span>
    </button>
  )
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

  const [revenueModalId, setRevenueModalId] = useState<string | null>(null)
  const [costModalId, setCostModalId] = useState<string | null>(null)
  const [profitModalId, setProfitModalId] = useState<string | null>(null)

  const revenueContract = activeContracts.find(c => c.id === revenueModalId) || null
  const costContract = activeContracts.find(c => c.id === costModalId) || null
  const profitContract = activeContracts.find(c => c.id === profitModalId) || null

  // Close any modal whose contract has gone away (e.g. archived elsewhere).
  useEffect(() => {
    if (revenueModalId && !revenueContract) setRevenueModalId(null)
    if (costModalId && !costContract) setCostModalId(null)
    if (profitModalId && !profitContract) setProfitModalId(null)
  }, [revenueModalId, costModalId, profitModalId, revenueContract, costContract, profitContract])

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
              Active-contract billing view. Revenue is the government invoice amount per cycle; cost is the sum of locked subcontractor pay rates.
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
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Projected revenue</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{formatCurrency(projectedInvoiceTotal)}</p>
            <p className="mt-0.5 text-[11px] text-emerald-700/70">Government invoicing across active contracts</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">Subcontractor costs</p>
            <p className="mt-1 text-2xl font-black text-rose-900">{formatCurrency(projectedSubkSpend)}</p>
            <p className="mt-0.5 text-[11px] text-rose-700/70">Locked subcontractor pay rates on active contracts</p>
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
              Revenue − Subcontractor costs
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
                <th>Revenue</th>
                <th>Subk Cost</th>
                <th>Profit</th>
                <th>Gov Status</th>
                <th>Subk Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No active contracts available for finance projections.
                  </td>
                </tr>
              )}
              {activeContracts.map(contract => {
                const { isRecurring, invoiceReady, invoiceAmount, subkSpend, profit, subkDueDate } = getFinanceProjectionRow(contract)
                const status = contract.governmentBillingStatus
                const badge = status ? GOV_STATUS_BADGE[status] : null
                const profitTone: 'profit-pos' | 'profit-neg' = profit >= 0 ? 'profit-pos' : 'profit-neg'
                const unit = isRecurring ? 'per month' : 'total value'
                const subkCount = (contract.lockedSubcontractors || []).length
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
                    <td className="whitespace-nowrap">
                      <MoneyCell
                        amount={invoiceAmount}
                        unitLabel={unit}
                        tone="revenue"
                        onClick={() => setRevenueModalId(contract.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      <MoneyCell
                        amount={subkSpend}
                        unitLabel={`${subkCount} subk${subkCount === 1 ? '' : 's'} · ${unit}`}
                        tone="cost"
                        onClick={() => setCostModalId(contract.id)}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      <MoneyCell
                        amount={profit}
                        unitLabel={invoiceAmount > 0 ? `${Math.round((profit / invoiceAmount) * 100)}% margin` : '—'}
                        tone={profitTone}
                        onClick={() => setProfitModalId(contract.id)}
                      />
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

      <DetailModal
        open={!!revenueContract}
        onClose={() => setRevenueModalId(null)}
        title="Revenue detail"
        subtitle={revenueContract?.title}
      >
        {revenueContract && (
          <RevenueDetailModal
            key={revenueContract.id}
            contract={revenueContract}
            onClose={() => setRevenueModalId(null)}
          />
        )}
      </DetailModal>

      <DetailModal
        open={!!costContract}
        onClose={() => setCostModalId(null)}
        title="Subcontractor cost detail"
        subtitle={costContract?.title}
      >
        {costContract && (
          <SubkCostDetailBody
            key={costContract.id}
            contract={costContract}
            onClose={() => setCostModalId(null)}
          />
        )}
      </DetailModal>

      <DetailModal
        open={!!profitContract}
        onClose={() => setProfitModalId(null)}
        title="Profit breakdown"
        subtitle={profitContract?.title}
      >
        {profitContract && (
          <ProfitDetailBody
            key={profitContract.id}
            contract={profitContract}
            onClose={() => setProfitModalId(null)}
          />
        )}
      </DetailModal>
    </div>
  )
}

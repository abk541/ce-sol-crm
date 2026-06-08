import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { DollarSign, Download, Filter, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type {
  Contract,
  ContractInvoice,
  GovBillingStatus,
  InvoicePaymentMethod,
  SubInvoiceStatus,
} from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractInvoicePdf } from '../lib/invoicePdf'
import { subkSpendForContract } from '../lib/financeProjections'

// ── Constants ─────────────────────────────────────────────────────────
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const STATUS_OPTIONS: { value: GovBillingStatus; label: string }[] = [
  { value: 'SUBMITTED',         label: 'Submitted' },
  { value: 'BILLED',            label: 'Billed' },
  { value: 'SENT_FOR_APPROVAL', label: 'Sent for approval' },
  { value: 'REJECTED',          label: 'Rejected' },
  { value: 'PAID',              label: 'Paid' },
]

const STATUS_BADGE: Record<GovBillingStatus, string> = {
  SUBMITTED:         'bg-sky-100 text-sky-700',
  BILLED:            'bg-indigo-100 text-indigo-700',
  SENT_FOR_APPROVAL: 'bg-amber-100 text-amber-700',
  REJECTED:          'bg-rose-100 text-rose-700',
  PAID:              'bg-emerald-100 text-emerald-700',
}

const PAYMENT_METHOD_OPTIONS: { value: InvoicePaymentMethod; label: string }[] = [
  { value: 'TUNGSTEN', label: 'Tungsten' },
  { value: 'IPP',      label: 'IPP' },
  { value: 'WAWF',     label: 'WAWF' },
  { value: 'EMAIL',    label: 'Email' },
  { value: 'OTHER',    label: 'Other' },
]
const PAYMENT_METHOD_LABEL: Record<InvoicePaymentMethod, string> =
  Object.fromEntries(PAYMENT_METHOD_OPTIONS.map(o => [o.value, o.label])) as Record<InvoicePaymentMethod, string>

const SUB_STATUS_OPTIONS: { value: SubInvoiceStatus; label: string }[] = [
  { value: 'NOT_PAID', label: 'Not paid' },
  { value: 'PARTIAL',  label: 'Partial' },
  { value: 'PAID',     label: 'Paid' },
]
const SUB_STATUS_BADGE: Record<SubInvoiceStatus, string> = {
  NOT_PAID: 'bg-slate-100 text-slate-600',
  PARTIAL:  'bg-amber-100 text-amber-700',
  PAID:     'bg-emerald-100 text-emerald-700',
}

// ── Helpers ───────────────────────────────────────────────────────────
function fmtDateMDY(iso?: string) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

function monthKeyFromIso(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 7) // "YYYY-MM"
}
function monthLabel(monthKey: string) {
  if (!monthKey) return 'Unscheduled'
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${(MONTHS_LONG[idx] || '').toUpperCase()} ${y}`
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function defaultSubQuote(contract: Contract | undefined): number {
  if (!contract) return 0
  return subkSpendForContract(contract)
}
function defaultSubStatus(contract: Contract | undefined): SubInvoiceStatus {
  const subks = contract?.lockedSubcontractors || []
  if (subks.length === 0) return 'NOT_PAID'
  const paidCount = subks.filter(s => s.paid).length
  if (paidCount === 0) return 'NOT_PAID'
  if (paidCount === subks.length) return 'PAID'
  return 'PARTIAL'
}

function effectiveSubQuote(invoice: ContractInvoice, contract: Contract | undefined): number {
  return typeof invoice.subQuote === 'number' && Number.isFinite(invoice.subQuote)
    ? invoice.subQuote
    : defaultSubQuote(contract)
}
function effectiveDueDate(invoice: ContractInvoice): string {
  if (invoice.dueDate) return invoice.dueDate
  if (invoice.invoiceDate) return addDaysIso(invoice.invoiceDate, 30)
  return ''
}
function effectiveSubStatus(invoice: ContractInvoice, contract: Contract | undefined): SubInvoiceStatus {
  return invoice.subStatus ?? defaultSubStatus(contract)
}

function nextInvoiceNumber(contracts: Contract[]): string {
  let max = 0
  for (const c of contracts) {
    for (const inv of (c.invoices || [])) {
      const m = inv.invoiceNumber.match(/(\d+)\s*$/)
      if (m) {
        const n = Number(m[1])
        if (Number.isFinite(n) && n > max) max = n
      }
    }
  }
  return `INV-CES-${String(max + 1).padStart(3, '0')}`
}

// ── Modal shell (portal + AnimatePresence per project rules) ─────────
function DetailModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: string
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
            className={`relative z-10 flex w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
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

// ── Add/Edit invoice form ─────────────────────────────────────────────
type InvoiceFormState = {
  contractId: string
  invoiceNumber: string
  invoiceDate: string
  amount: string
  paymentMethod: InvoicePaymentMethod | ''
  status: GovBillingStatus
  subQuote: string
  subQuoteOverride: boolean
  dueDate: string
  dueDateOverride: boolean
  subStatus: SubInvoiceStatus | ''
  subStatusOverride: boolean
  notes: string
}

function InvoiceForm({
  initial,
  contracts,
  onCancel,
  onSubmit,
  onDelete,
}: {
  initial: InvoiceFormState
  contracts: Contract[]
  onCancel: () => void
  onSubmit: (state: InvoiceFormState) => void
  onDelete?: () => void
}) {
  const [state, setState] = useState<InvoiceFormState>(initial)
  const set = <K extends keyof InvoiceFormState>(k: K, v: InvoiceFormState[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  const selectedContract = contracts.find(c => c.id === state.contractId)
  const autoSubQuote = defaultSubQuote(selectedContract)
  const autoDueDate = state.invoiceDate ? addDaysIso(state.invoiceDate, 30) : ''
  const autoSubStatus = defaultSubStatus(selectedContract)

  // When the user has not overridden auto fields, keep them in sync with derived values.
  useEffect(() => {
    if (!state.subQuoteOverride) set('subQuote', autoSubQuote ? String(autoSubQuote) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contractId])
  useEffect(() => {
    if (!state.dueDateOverride) set('dueDate', autoDueDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.invoiceDate])
  useEffect(() => {
    if (!state.subStatusOverride) set('subStatus', autoSubStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contractId])

  const submit = () => {
    if (!state.contractId) { toast.error('Pick a contract'); return }
    if (!state.invoiceNumber.trim()) { toast.error('Invoice number is required'); return }
    if (!state.invoiceDate) { toast.error('Invoice date is required'); return }
    const amt = Number(state.amount)
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Amount must be a non-negative number'); return }
    onSubmit(state)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Contract</label>
        <select
          className="input-field mt-1 w-full"
          value={state.contractId}
          onChange={e => set('contractId', e.target.value)}
        >
          <option value="">— Select contract —</option>
          {contracts.map(c => (
            <option key={c.id} value={c.id}>
              {c.title} {c.contractId ? `· ${c.contractId}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice number</label>
          <input
            className="input-field mt-1 w-full"
            value={state.invoiceNumber}
            onChange={e => set('invoiceNumber', e.target.value)}
            placeholder="INV-CES-001"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice date</label>
          <input
            type="date"
            className="input-field mt-1 w-full"
            value={state.invoiceDate}
            onChange={e => set('invoiceDate', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input-field mt-1 w-full"
            value={state.amount}
            onChange={e => set('amount', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment method</label>
          <select
            className="input-field mt-1 w-full"
            value={state.paymentMethod}
            onChange={e => set('paymentMethod', e.target.value as InvoicePaymentMethod | '')}
          >
            <option value="">— None —</option>
            {PAYMENT_METHOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</label>
          <select
            className="input-field mt-1 w-full"
            value={state.status}
            onChange={e => set('status', e.target.value as GovBillingStatus)}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
          <input
            className="input-field mt-1 w-full"
            value={state.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Subcontractor payout</p>
          <p className="text-[10px] text-slate-400">Auto-seeded from locked subks · editable</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Sub quote</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-field mt-1 w-full"
                value={state.subQuote}
                onChange={e => set('subQuote', e.target.value)}
                disabled={!state.subQuoteOverride && !state.contractId}
              />
            </div>
            <label className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <input
                type="checkbox"
                checked={state.subQuoteOverride}
                onChange={e => {
                  const next = e.target.checked
                  set('subQuoteOverride', next)
                  if (!next) set('subQuote', autoSubQuote ? String(autoSubQuote) : '')
                }}
              />
              Override (auto: {formatCurrency(autoSubQuote)})
            </label>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Due date</label>
            <input
              type="date"
              className="input-field mt-1 w-full"
              value={state.dueDate}
              onChange={e => set('dueDate', e.target.value)}
            />
            <label className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <input
                type="checkbox"
                checked={state.dueDateOverride}
                onChange={e => {
                  const next = e.target.checked
                  set('dueDateOverride', next)
                  if (!next) set('dueDate', autoDueDate)
                }}
              />
              Override (auto: invoice date + 30d)
            </label>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Sub status</label>
            <select
              className="input-field mt-1 w-full"
              value={state.subStatus}
              onChange={e => set('subStatus', e.target.value as SubInvoiceStatus | '')}
            >
              <option value="">— Auto —</option>
              {SUB_STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <input
                type="checkbox"
                checked={state.subStatusOverride}
                onChange={e => {
                  const next = e.target.checked
                  set('subStatusOverride', next)
                  if (!next) set('subStatus', autoSubStatus)
                }}
              />
              Override (auto: {SUB_STATUS_OPTIONS.find(o => o.value === autoSubStatus)?.label})
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {onDelete ? (
          <button type="button" onClick={onDelete} className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-50">
            <Trash2 size={12} /> Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
          <button type="button" onClick={submit} className="btn-primary">Save invoice</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────
type Row = {
  invoice: ContractInvoice
  contract: Contract | undefined
  subQuote: number
  dueDate: string
  subStatus: SubInvoiceStatus
}

export default function FinanceProjectionsPage() {
  const { contracts, addContractInvoice, updateContractInvoice, removeContractInvoice } = useStore()

  // Flatten all invoices + denormalize.
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = []
    for (const c of contracts) {
      for (const inv of (c.invoices || [])) {
        rows.push({
          invoice: inv,
          contract: c,
          subQuote: effectiveSubQuote(inv, c),
          dueDate: effectiveDueDate(inv),
          subStatus: effectiveSubStatus(inv, c),
        })
      }
    }
    return rows
  }, [contracts])

  // ── Filters ─────────────────────────────────────────────────────────
  const yearOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of allRows) {
      const y = r.invoice.invoiceDate?.slice(0, 4)
      if (y) set.add(y)
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [allRows])

  const defaultYear = yearOptions[0] ?? String(new Date().getFullYear())
  const [yearFilter, setYearFilter] = useState<string>('ALL')
  const [monthFilter, setMonthFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<GovBillingStatus | 'ALL'>('ALL')
  const [methodFilter, setMethodFilter] = useState<InvoicePaymentMethod | 'ALL'>('ALL')
  const [searchTerm, setSearchTerm] = useState<string>('')

  useEffect(() => {
    if (yearFilter === 'ALL' && yearOptions.length > 0) setYearFilter(defaultYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearOptions.length])

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return allRows.filter(r => {
      const y = r.invoice.invoiceDate?.slice(0, 4) || ''
      const m = r.invoice.invoiceDate?.slice(5, 7) || ''
      if (yearFilter !== 'ALL' && y !== yearFilter) return false
      if (monthFilter !== 'ALL' && m !== monthFilter) return false
      if (statusFilter !== 'ALL' && r.invoice.status !== statusFilter) return false
      if (methodFilter !== 'ALL' && r.invoice.paymentMethod !== methodFilter) return false
      if (term) {
        const haystack = [
          r.contract?.title,
          r.contract?.contractId,
          r.invoice.invoiceNumber,
          r.invoice.notes,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [allRows, yearFilter, monthFilter, statusFilter, methodFilter, searchTerm])

  // Sort by invoice date ascending so monthly groups appear chronologically.
  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => a.invoice.invoiceDate.localeCompare(b.invoice.invoiceDate)),
    [filteredRows],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of sortedRows) {
      const key = monthKeyFromIso(r.invoice.invoiceDate)
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return Array.from(map.entries()) // [ [monthKey, rows], ... ]
  }, [sortedRows])

  // ── Totals ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalAmount = sortedRows.reduce((s, r) => s + (r.invoice.amount || 0), 0)
    const totalSubQuote = sortedRows.reduce((s, r) => s + (r.subQuote || 0), 0)
    const totalProfit = totalAmount - totalSubQuote
    const paidAmount = sortedRows
      .filter(r => r.invoice.status === 'PAID')
      .reduce((s, r) => s + (r.invoice.amount || 0), 0)
    const outstandingAmount = totalAmount - paidAmount
    return { totalAmount, totalSubQuote, totalProfit, paidAmount, outstandingAmount, count: sortedRows.length }
  }, [sortedRows])

  // ── Modal state ─────────────────────────────────────────────────────
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [creating, setCreating] = useState<boolean>(false)
  const editingRow = sortedRows.find(r => r.invoice.id === editingInvoiceId)

  const openCreate = () => setCreating(true)
  const closeCreate = () => setCreating(false)
  const openEdit = (id: string) => setEditingInvoiceId(id)
  const closeEdit = () => setEditingInvoiceId(null)

  const today = new Date().toISOString().slice(0, 10)
  const seedCreate: InvoiceFormState = {
    contractId: contracts[0]?.id ?? '',
    invoiceNumber: nextInvoiceNumber(contracts),
    invoiceDate: today,
    amount: '',
    paymentMethod: '',
    status: 'SUBMITTED',
    subQuote: defaultSubQuote(contracts[0]) ? String(defaultSubQuote(contracts[0])) : '',
    subQuoteOverride: false,
    dueDate: addDaysIso(today, 30),
    dueDateOverride: false,
    subStatus: defaultSubStatus(contracts[0]),
    subStatusOverride: false,
    notes: '',
  }

  const seedEdit = (row: Row): InvoiceFormState => ({
    contractId: row.invoice.contractId,
    invoiceNumber: row.invoice.invoiceNumber,
    invoiceDate: row.invoice.invoiceDate,
    amount: String(row.invoice.amount ?? 0),
    paymentMethod: row.invoice.paymentMethod ?? '',
    status: row.invoice.status,
    subQuote: typeof row.invoice.subQuote === 'number' ? String(row.invoice.subQuote) : '',
    subQuoteOverride: row.invoice.subQuote != null,
    dueDate: row.invoice.dueDate ?? '',
    dueDateOverride: !!row.invoice.dueDate,
    subStatus: row.invoice.subStatus ?? '',
    subStatusOverride: row.invoice.subStatus != null,
    notes: row.invoice.notes ?? '',
  })

  const handleCreate = (state: InvoiceFormState) => {
    addContractInvoice(state.contractId, {
      invoiceNumber: state.invoiceNumber.trim(),
      invoiceDate: state.invoiceDate,
      amount: Number(state.amount) || 0,
      paymentMethod: state.paymentMethod || undefined,
      status: state.status,
      subQuote: state.subQuoteOverride ? (Number(state.subQuote) || 0) : undefined,
      dueDate: state.dueDateOverride ? state.dueDate : undefined,
      subStatus: state.subStatusOverride && state.subStatus ? state.subStatus : undefined,
      notes: state.notes.trim() || undefined,
    })
    toast.success('Invoice added')
    closeCreate()
  }

  const handleUpdate = (state: InvoiceFormState) => {
    if (!editingRow) return
    updateContractInvoice(editingRow.invoice.contractId, editingRow.invoice.id, {
      invoiceNumber: state.invoiceNumber.trim(),
      invoiceDate: state.invoiceDate,
      amount: Number(state.amount) || 0,
      paymentMethod: state.paymentMethod || undefined,
      status: state.status,
      subQuote: state.subQuoteOverride ? (Number(state.subQuote) || 0) : undefined,
      dueDate: state.dueDateOverride ? state.dueDate : undefined,
      subStatus: state.subStatusOverride && state.subStatus ? state.subStatus : undefined,
      notes: state.notes.trim() || undefined,
    })
    toast.success('Invoice updated')
    closeEdit()
  }

  const handleDelete = () => {
    if (!editingRow) return
    if (!confirm(`Delete invoice ${editingRow.invoice.invoiceNumber}? This cannot be undone.`)) return
    removeContractInvoice(editingRow.invoice.contractId, editingRow.invoice.id)
    toast.success('Invoice deleted')
    closeEdit()
  }

  const handleQuickStatus = (row: Row, next: GovBillingStatus) => {
    updateContractInvoice(row.invoice.contractId, row.invoice.id, { status: next })
  }
  const handleQuickSubStatus = (row: Row, next: SubInvoiceStatus | '') => {
    updateContractInvoice(row.invoice.contractId, row.invoice.id, {
      subStatus: next || undefined,
    })
  }
  const handleQuickMethod = (row: Row, next: InvoicePaymentMethod | '') => {
    updateContractInvoice(row.invoice.contractId, row.invoice.id, {
      paymentMethod: next || undefined,
    })
  }

  const handleGeneratePdf = async (row: Row) => {
    if (!row.contract) {
      toast.error('Contract for this invoice is missing')
      return
    }
    try {
      await generateContractInvoicePdf(row.contract)
      toast.success(`PDF generated for ${row.invoice.invoiceNumber}`)
    } catch (err) {
      console.error(err)
      toast.error('Could not generate invoice PDF')
    }
  }

  const resetFilters = () => {
    setYearFilter(defaultYear)
    setMonthFilter('ALL')
    setStatusFilter('ALL')
    setMethodFilter('ALL')
    setSearchTerm('')
  }

  return (
    <div className="p-6 page-enter space-y-4">
      {/* Header + KPIs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Finance</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
              <DollarSign size={22} className="text-emerald-500" /> Finance Projections
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Invoice tracker grouped by month. Each row is one government invoice with its subcontractor payout context.
            </p>
          </div>
          <button type="button" onClick={openCreate} className="btn-primary gap-1">
            <Plus size={14} /> Add invoice
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Invoiced (filtered)</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{formatCurrency(totals.totalAmount)}</p>
            <p className="mt-0.5 text-[11px] text-emerald-700/70">{totals.count} invoice{totals.count === 1 ? '' : 's'}</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700">Sub quotes</p>
            <p className="mt-1 text-2xl font-black text-rose-900">{formatCurrency(totals.totalSubQuote)}</p>
            <p className="mt-0.5 text-[11px] text-rose-700/70">Subcontractor payout per filter</p>
          </div>
          <div
            className={`rounded-2xl border p-4 ${
              totals.totalProfit >= 0 ? 'border-slate-300 bg-slate-900 text-white' : 'border-rose-300 bg-rose-100'
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${totals.totalProfit >= 0 ? 'text-slate-300' : 'text-rose-700'}`}>
              Profit (filtered)
            </p>
            <p className={`mt-1 text-2xl font-black ${totals.totalProfit >= 0 ? 'text-white' : 'text-rose-900'}`}>
              {formatCurrency(totals.totalProfit)}
            </p>
            <p className={`mt-0.5 text-[11px] ${totals.totalProfit >= 0 ? 'text-slate-400' : 'text-rose-700/70'}`}>
              Invoiced − Sub quotes
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Outstanding</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{formatCurrency(totals.outstandingAmount)}</p>
            <p className="mt-0.5 text-[11px] text-amber-700/70">Not yet marked Paid</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Filter size={12} /> Filters
          </div>

          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field py-1.5 pl-7 text-xs"
              placeholder="Search contract or invoice…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="input-field py-1.5 text-xs"
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
          >
            <option value="ALL">All years</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select
            className="input-field py-1.5 text-xs"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
          >
            <option value="ALL">All months</option>
            {MONTHS_LONG.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>

          <select
            className="input-field py-1.5 text-xs"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as GovBillingStatus | 'ALL')}
          >
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            className="input-field py-1.5 text-xs"
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value as InvoicePaymentMethod | 'ALL')}
          >
            <option value="ALL">All methods</option>
            {PAYMENT_METHOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Grouped table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Contract Name</th>
                <th className="px-3 py-2 text-left">Contract Number</th>
                <th className="px-3 py-2 text-left">Invoice Nr</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Payment Method</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Sub Quote</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-left">Sub Status</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-sm text-slate-400">
                    No invoices match the current filters. Click <span className="font-bold">Add invoice</span> to record one.
                  </td>
                </tr>
              )}
              {groups.map(([monthKey, rows], gi) => {
                const monthAmount = rows.reduce((s, r) => s + (r.invoice.amount || 0), 0)
                const monthSubQuote = rows.reduce((s, r) => s + (r.subQuote || 0), 0)
                const monthProfit = monthAmount - monthSubQuote
                return (
                  <Fragment key={monthKey || 'unscheduled'}>
                    {rows.map((row, ri) => {
                      const status = row.invoice.status
                      const subStatus = row.subStatus
                      const method = row.invoice.paymentMethod
                      return (
                        <tr key={row.invoice.id} className="hover:bg-slate-50">
                          {ri === 0 && (
                            <td
                              rowSpan={rows.length + 1 /* +1 to also span the subtotal row */}
                              className="border-r border-slate-100 bg-amber-50 align-middle px-2 py-2 text-center"
                              style={{ width: 60 }}
                            >
                              <p
                                className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700"
                                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                              >
                                {monthLabel(monthKey)}
                              </p>
                            </td>
                          )}
                          <td className="px-3 py-2 max-w-[260px]">
                            <p className="truncate font-bold text-slate-800" title={row.contract?.title || ''}>
                              {row.contract?.title || '— missing contract —'}
                            </p>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                            {row.contract?.contractId || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                            {row.invoice.invoiceNumber}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {fmtDateMDY(row.invoice.invoiceDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-slate-900">
                            {formatCurrency(row.invoice.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={method ?? ''}
                              onChange={e => handleQuickMethod(row, e.target.value as InvoicePaymentMethod | '')}
                              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:border-indigo-400 focus:outline-none"
                            >
                              <option value="">—</option>
                              {PAYMENT_METHOD_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={status}
                              onChange={e => handleQuickStatus(row, e.target.value as GovBillingStatus)}
                              className={`rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold focus:border-indigo-400 focus:outline-none ${STATUS_BADGE[status]}`}
                            >
                              {STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-slate-700">
                            {formatCurrency(row.subQuote)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {fmtDateMDY(row.dueDate)}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={row.invoice.subStatus ?? ''}
                              onChange={e => handleQuickSubStatus(row, e.target.value as SubInvoiceStatus | '')}
                              className={`rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold focus:border-indigo-400 focus:outline-none ${SUB_STATUS_BADGE[subStatus]}`}
                              title={row.invoice.subStatus ? 'Manual override' : `Auto: ${SUB_STATUS_OPTIONS.find(o => o.value === subStatus)?.label}`}
                            >
                              <option value="">— Auto —</option>
                              {SUB_STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(row.invoice.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit invoice"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleGeneratePdf(row)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Generate invoice PDF"
                              >
                                <Download size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Group subtotal */}
                    <tr key={`${monthKey}-subtotal`} className="bg-emerald-50/70 font-bold text-slate-800">
                      <td colSpan={4} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-slate-500">
                        {monthLabel(monthKey)} subtotal
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-emerald-800">
                        {formatCurrency(monthAmount)}
                      </td>
                      <td colSpan={2} className="px-3 py-1.5" />
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-rose-700">
                        {formatCurrency(monthSubQuote)}
                      </td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                        Profit: <span className={monthProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(monthProfit)}</span>
                      </td>
                      <td className="px-3 py-1.5" />
                    </tr>
                    {/* Spacer between groups */}
                    {gi < groups.length - 1 && (
                      <tr key={`${monthKey}-spacer`} className="h-1.5">
                        <td colSpan={12} />
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 font-black text-white">
                  <td colSpan={5} className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.2em] text-slate-300">
                    Grand total
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
                  <td colSpan={2} className="px-3 py-2" />
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(totals.totalSubQuote)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-300">
                    Profit: <span className={totals.totalProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatCurrency(totals.totalProfit)}</span>
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modals */}
      <DetailModal
        open={creating}
        onClose={closeCreate}
        title="Add invoice"
        subtitle="Record a new government invoice"
        maxWidth="max-w-2xl"
      >
        {creating && (
          <InvoiceForm
            key="create"
            initial={seedCreate}
            contracts={contracts}
            onCancel={closeCreate}
            onSubmit={handleCreate}
          />
        )}
      </DetailModal>

      <DetailModal
        open={!!editingRow}
        onClose={closeEdit}
        title={editingRow ? `Edit ${editingRow.invoice.invoiceNumber}` : 'Edit invoice'}
        subtitle={editingRow?.contract?.title}
        maxWidth="max-w-2xl"
      >
        {editingRow && (
          <InvoiceForm
            key={editingRow.invoice.id}
            initial={seedEdit(editingRow)}
            contracts={contracts}
            onCancel={closeEdit}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </DetailModal>
    </div>
  )
}

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import type {
  Contract,
  ContractInvoice,
  ContractLineItem,
  ContractLineYear,
  InvoicePaymentMethod,
  SubInvoiceStatus,
} from '../types'
import { formatCurrency } from '../lib/utils'
import { generateContractInvoicePdf, INVOICE_FROM_LINES, invoiceAmountForContract } from '../lib/invoicePdf'
import { subkSpendForContract } from '../lib/financeProjections'
import { formatInvoiceSequence } from '../lib/invoiceNumbers'

// ── Constants ─────────────────────────────────────────────────────────
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

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

const LINE_YEAR_LABELS: Record<ContractLineYear, string> = {
  base: 'Base Year',
  option1: 'Option year 1',
  option2: 'Option year 2',
  option3: 'Option year 3',
  option4: 'Option year 4',
}

const LINE_YEAR_ORDER: ContractLineYear[] = ['base', 'option1', 'option2', 'option3', 'option4']

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

function lineItemsForInvoice(invoice: ContractInvoice, contract: Contract | undefined): ContractLineItem[] {
  const all = contract?.lineItems || []
  const selected = new Set(invoice.lineItemIds || [])
  if (selected.size > 0) return all.filter(line => selected.has(line.id))
  const year = invoice.popYear || contract?.currentPopYear || 'base'
  return all.filter(line => line.year === year)
}

function lineItemTotal(items: ContractLineItem[]) {
  return items.reduce((sum, line) => sum + (line.amount || 0), 0)
}

function lineItemLabel(line: ContractLineItem) {
  const name = line.description ? ` - ${line.description}` : ''
  const amount = line.amount ? ` (${formatCurrency(line.amount)})` : ''
  return `${line.clin}${name}${amount}`
}

function servicePeriodLabel(start?: string, end?: string) {
  if (start && end) return `${fmtDateMDY(start)} to ${fmtDateMDY(end)}`
  if (start) return fmtDateMDY(start)
  if (end) return fmtDateMDY(end)
  return '—'
}

function defaultPopYear(contract: Contract | undefined): ContractLineYear {
  return contract?.currentPopYear || 'base'
}

function defaultServiceFrom(contract: Contract | undefined) {
  return contract?.billingPeriodStart || contract?.serviceDate || contract?.popStart || ''
}

function defaultServiceTo(contract: Contract | undefined) {
  return contract?.billingPeriodEnd || contract?.serviceDate || contract?.popEnd || ''
}

function defaultLineItems(contract: Contract | undefined, year: ContractLineYear) {
  return (contract?.lineItems || []).filter(line => line.year === year)
}

function defaultInvoiceAmount(contract: Contract | undefined, items: ContractLineItem[]) {
  const fromLines = lineItemTotal(items)
  if (fromLines > 0) return fromLines
  return contract ? invoiceAmountForContract(contract) : 0
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
  serviceFrom: string
  serviceTo: string
  popYear: ContractLineYear | ''
  lineItemIds: string[]
  amount: string
  paymentMethod: InvoicePaymentMethod | ''
  dueDate: string
  subStatus: SubInvoiceStatus | ''
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
  const mounted = useRef(false)
  const set = <K extends keyof InvoiceFormState>(k: K, v: InvoiceFormState[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  const selectedContract = contracts.find(c => c.id === state.contractId)
  const selectedYear = (state.popYear || defaultPopYear(selectedContract)) as ContractLineYear
  const availableLineItems = defaultLineItems(selectedContract, selectedYear)
  const selectedLineItems = availableLineItems.filter(line => state.lineItemIds.includes(line.id))
  const selectedAmount = defaultInvoiceAmount(selectedContract, selectedLineItems)
  const autoSubQuote = defaultSubQuote(selectedContract)
  const autoDueDate = state.invoiceDate ? addDaysIso(state.invoiceDate, 30) : ''
  const autoSubStatus = defaultSubStatus(selectedContract)

  const syncFromContract = (contract: Contract | undefined) => {
    const year = defaultPopYear(contract)
    const lines = defaultLineItems(contract, year)
    setState(prev => ({
      ...prev,
      serviceFrom: defaultServiceFrom(contract),
      serviceTo: defaultServiceTo(contract),
      popYear: year,
      lineItemIds: lines.map(line => line.id),
      amount: String(defaultInvoiceAmount(contract, lines)),
    }))
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    syncFromContract(selectedContract)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contractId])
  useEffect(() => {
    set('dueDate', autoDueDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.invoiceDate])
  useEffect(() => {
    set('subStatus', autoSubStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contractId])

  useEffect(() => {
    const next = String(selectedAmount)
    if (state.amount !== next) set('amount', next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contractId, state.popYear, state.lineItemIds.join('|')])

  const changePopYear = (year: ContractLineYear) => {
    const lines = defaultLineItems(selectedContract, year)
    setState(prev => ({
      ...prev,
      popYear: year,
      lineItemIds: lines.map(line => line.id),
      amount: String(defaultInvoiceAmount(selectedContract, lines)),
    }))
  }

  const toggleLineItem = (id: string) => {
    setState(prev => {
      const exists = prev.lineItemIds.includes(id)
      const nextIds = exists ? prev.lineItemIds.filter(itemId => itemId !== id) : [...prev.lineItemIds, id]
      const nextItems = availableLineItems.filter(line => nextIds.includes(line.id))
      return {
        ...prev,
        lineItemIds: nextIds,
        amount: String(defaultInvoiceAmount(selectedContract, nextItems)),
      }
    })
  }

  const submit = () => {
    if (!state.contractId) { toast.error('Pick a contract'); return }
    if (!state.invoiceNumber.trim()) { toast.error('Invoice number is required'); return }
    if (!state.invoiceDate) { toast.error('Invoice date is required'); return }
    if (!state.serviceFrom || !state.serviceTo) { toast.error('Service from and service to are required'); return }
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">From</p>
        <div className="mt-2 space-y-0.5 text-xs font-semibold text-slate-700">
          {INVOICE_FROM_LINES.map(line => <p key={line}>{line}</p>)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice number</label>
          <input
            className="input-field mt-1 w-full"
            value={state.invoiceNumber}
            onChange={e => set('invoiceNumber', e.target.value)}
            placeholder="INV-CES-26-0001"
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
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Service from</label>
          <input
            type="date"
            className="input-field mt-1 w-full"
            value={state.serviceFrom}
            onChange={e => set('serviceFrom', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Service to</label>
          <input
            type="date"
            className="input-field mt-1 w-full"
            value={state.serviceTo}
            onChange={e => set('serviceTo', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">POP year</label>
          <select
            className="input-field mt-1 w-full"
            value={selectedYear}
            onChange={e => changePopYear(e.target.value as ContractLineYear)}
          >
            {LINE_YEAR_ORDER.map(year => (
              <option key={year} value={year}>{LINE_YEAR_LABELS[year]}</option>
            ))}
          </select>
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
          <p className="mt-1 text-[10px] text-slate-400">
            {selectedLineItems.length ? `Auto from ${selectedLineItems.length} CLIN${selectedLineItems.length === 1 ? '' : 's'}` : 'Fallback from contract invoice amount'}
          </p>
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
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
          <input
            className="input-field mt-1 w-full"
            value={state.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">CLINs</p>
          <p className="text-[10px] font-semibold text-slate-400">
            {selectedLineItems.length ? `${selectedLineItems.length} selected - ${formatCurrency(lineItemTotal(selectedLineItems))}` : 'No CLIN selected'}
          </p>
        </div>
        {availableLineItems.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No CLINs have been added for {LINE_YEAR_LABELS[selectedYear]} in Contract Admin.
          </p>
        ) : (
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            {availableLineItems.map(line => (
              <label
                key={line.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700 shadow-sm transition-colors hover:bg-emerald-50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={state.lineItemIds.includes(line.id)}
                  onChange={() => toggleLineItem(line.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-black text-slate-900">{line.clin}</span>
                  <span className="ml-2 text-slate-600">{line.description || 'No description'}</span>
                  <span className="ml-2 whitespace-nowrap font-bold text-emerald-700">{formatCurrency(line.amount || 0)}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Subcontractor payout</p>
          <p className="text-[10px] text-slate-400">Automatic from locked subks</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sub quote</p>
            <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(autoSubQuote)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Due date</p>
            <p className="mt-1 text-sm font-black text-slate-900">{fmtDateMDY(state.dueDate)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sub status</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {SUB_STATUS_OPTIONS.find(o => o.value === state.subStatus)?.label || SUB_STATUS_OPTIONS.find(o => o.value === autoSubStatus)?.label}
            </p>
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
  lineItems: ContractLineItem[]
  subQuote: number
  dueDate: string
  subStatus: SubInvoiceStatus
}

function FilterSelect({
  icon,
  label,
  value,
  onChange,
  options,
  active,
}: {
  icon: ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  const current = options.find(o => o.value === value)?.label ?? ''

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: r.bottom + 6,
      left: r.left,
      width: Math.max(r.width, 180),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      const target = e.target as HTMLElement
      if (target.closest('[data-filter-popover]')) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          'group inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 outline-none transition-colors ' +
          (active
            ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-400'
            : 'border-slate-200 bg-slate-50 hover:border-slate-300') +
          (open ? ' ring-2 ring-emerald-100' : '')
        }
      >
        <span
          className={
            'flex h-5 w-5 items-center justify-center rounded-md shadow-sm ' +
            (active ? 'bg-emerald-500 text-white' : 'bg-white text-slate-500')
          }
        >
          {icon}
        </span>
        <span
          className={
            'text-[10px] font-bold uppercase tracking-wider ' +
            (active ? 'text-emerald-600' : 'text-slate-400')
          }
        >
          {label}
        </span>
        <span className="text-xs font-semibold text-slate-700">{current}</span>
        <ChevronDown
          size={12}
          className={
            '-ml-1 transition-transform ' +
            (open ? 'rotate-180 text-emerald-500' : active ? 'text-emerald-500' : 'text-slate-400')
          }
        />
      </button>

      {open && coords && createPortal(
        <div
          data-filter-popover
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width,
            zIndex: 60,
          }}
          className="overflow-hidden rounded-xl border"
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-strong)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(215,190,122,0.18)',
            }}
            className="overflow-hidden rounded-xl border"
          >
            <ul className="max-h-72 overflow-y-auto py-1">
              {options.map(o => {
                const selected = o.value === value
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors"
                      style={{
                        color: selected ? '#D7BE7A' : '#E2E8F0',
                        background: selected ? 'rgba(215,190,122,0.12)' : 'transparent',
                        fontWeight: selected ? 600 : 500,
                      }}
                      onMouseEnter={e => {
                        if (!selected) e.currentTarget.style.background = 'rgba(215,190,122,0.08)'
                      }}
                      onMouseLeave={e => {
                        if (!selected) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span>{o.label}</span>
                      {selected && <Check size={12} style={{ color: '#D7BE7A' }} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export default function FinanceProjectionsPage() {
  const { contracts, addContractInvoice, updateContractInvoice, removeContractInvoice, nextInvoiceNumber, consumeInvoiceNumber } = useStore()

  // Flatten all invoices + denormalize.
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = []
    for (const c of contracts) {
      for (const inv of (c.invoices || [])) {
        rows.push({
          invoice: inv,
          contract: c,
          lineItems: lineItemsForInvoice(inv, c),
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
  }, [allRows, yearFilter, monthFilter, methodFilter, searchTerm])

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
  const firstContract = contracts[0]
  const firstPopYear = defaultPopYear(firstContract)
  const firstLineItems = defaultLineItems(firstContract, firstPopYear)
  const seedCreate: InvoiceFormState = {
    contractId: firstContract?.id ?? '',
    invoiceNumber: formatInvoiceSequence(nextInvoiceNumber, today),
    invoiceDate: today,
    serviceFrom: defaultServiceFrom(firstContract),
    serviceTo: defaultServiceTo(firstContract),
    popYear: firstPopYear,
    lineItemIds: firstLineItems.map(line => line.id),
    amount: String(defaultInvoiceAmount(firstContract, firstLineItems)),
    paymentMethod: '',
    dueDate: addDaysIso(today, 30),
    subStatus: defaultSubStatus(firstContract),
    notes: '',
  }

  const seedEdit = (row: Row): InvoiceFormState => ({
    contractId: row.invoice.contractId,
    invoiceNumber: row.invoice.invoiceNumber,
    invoiceDate: row.invoice.invoiceDate,
    serviceFrom: row.invoice.serviceFrom || defaultServiceFrom(row.contract),
    serviceTo: row.invoice.serviceTo || defaultServiceTo(row.contract),
    popYear: row.invoice.popYear || defaultPopYear(row.contract),
    lineItemIds: row.lineItems.map(line => line.id),
    amount: String(row.invoice.amount ?? 0),
    paymentMethod: row.invoice.paymentMethod ?? '',
    dueDate: row.invoice.dueDate ?? addDaysIso(row.invoice.invoiceDate, 30),
    subStatus: row.invoice.subStatus ?? defaultSubStatus(row.contract),
    notes: row.invoice.notes ?? '',
  })

  const handleCreate = (state: InvoiceFormState) => {
    const generatedNumber = formatInvoiceSequence(consumeInvoiceNumber(), state.invoiceDate)
    addContractInvoice(state.contractId, {
      invoiceNumber: state.invoiceNumber.trim() || generatedNumber,
      invoiceDate: state.invoiceDate,
      amount: Number(state.amount) || 0,
      paymentMethod: state.paymentMethod || undefined,
      status: 'SUBMITTED',
      serviceFrom: state.serviceFrom,
      serviceTo: state.serviceTo,
      popYear: state.popYear || undefined,
      lineItemIds: state.lineItemIds,
      subQuote: undefined,
      dueDate: undefined,
      subStatus: undefined,
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
      status: 'SUBMITTED',
      serviceFrom: state.serviceFrom,
      serviceTo: state.serviceTo,
      popYear: state.popYear || undefined,
      lineItemIds: state.lineItemIds,
      subQuote: undefined,
      dueDate: undefined,
      subStatus: undefined,
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
      await generateContractInvoicePdf(row.contract, { invoice: row.invoice, lineItems: row.lineItems })
      toast.success(`PDF generated for ${row.invoice.invoiceNumber}`)
    } catch (err) {
      console.error(err)
      toast.error('Could not generate invoice PDF')
    }
  }

  const resetFilters = () => {
    setYearFilter(defaultYear)
    setMonthFilter('ALL')
    setMethodFilter('ALL')
    setSearchTerm('')
  }

  const activeFilterCount =
    (yearFilter !== defaultYear ? 1 : 0) +
    (monthFilter !== 'ALL' ? 1 : 0) +
    (methodFilter !== 'ALL' ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0)

  return (
    <div className="p-6 page-enter space-y-4">
      {/* Header + KPIs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Finance</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
              <DollarSign size={22} className="text-emerald-500" /> Billing Process
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Filter size={13} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-xs text-slate-700 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="Search contract or invoice…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <X size={11} /> Reset
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <FilterSelect
            icon={<Calendar size={12} />}
            label="Year"
            value={yearFilter}
            onChange={setYearFilter}
            active={yearFilter !== defaultYear}
            options={[
              { value: 'ALL', label: 'All years' },
              ...yearOptions.map(y => ({ value: y, label: y })),
            ]}
          />

          <FilterSelect
            icon={<CalendarDays size={12} />}
            label="Month"
            value={monthFilter}
            onChange={setMonthFilter}
            active={monthFilter !== 'ALL'}
            options={[
              { value: 'ALL', label: 'All months' },
              ...MONTHS_LONG.map((m, i) => ({
                value: String(i + 1).padStart(2, '0'),
                label: m,
              })),
            ]}
          />

          <FilterSelect
            icon={<CreditCard size={12} />}
            label="Method"
            value={methodFilter}
            onChange={v => setMethodFilter(v as InvoicePaymentMethod | 'ALL')}
            active={methodFilter !== 'ALL'}
            options={[
              { value: 'ALL', label: 'All methods' },
              ...PAYMENT_METHOD_OPTIONS.map(o => ({ value: o.value, label: o.label })),
            ]}
          />
        </div>
      </div>

      {/* Grouped table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Contract Name</th>
                <th className="px-3 py-2 text-left">Contract Number</th>
                <th className="px-3 py-2 text-left">Invoice Nr</th>
                <th className="px-3 py-2 text-left">Invoice Date</th>
                <th className="px-3 py-2 text-left">Service Period</th>
                <th className="px-3 py-2 text-left">POP Year</th>
                <th className="px-3 py-2 text-left">CLINs</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Payment Method</th>
                <th className="px-3 py-2 text-right">Sub Quote</th>
                <th className="px-3 py-2 text-left">Due Date</th>
                <th className="px-3 py-2 text-left">Sub Status</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-sm text-slate-400">
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
                    <tr className="bg-amber-50/70">
                      <td colSpan={13} className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                        {monthLabel(monthKey)}
                      </td>
                    </tr>
                    {rows.map((row, ri) => {
                      const subStatus = row.subStatus
                      const method = row.invoice.paymentMethod
                      return (
                        <tr key={row.invoice.id} className="hover:bg-slate-50">
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
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {servicePeriodLabel(row.invoice.serviceFrom, row.invoice.serviceTo)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                            {LINE_YEAR_LABELS[(row.invoice.popYear || row.contract?.currentPopYear || 'base') as ContractLineYear]}
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-slate-600">
                            <p className="truncate" title={row.lineItems.map(lineItemLabel).join(', ')}>
                              {row.lineItems.length ? row.lineItems.map(line => line.clin).join(', ') : 'No CLINs'}
                            </p>
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
                      <td colSpan={7} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-slate-500">
                        {monthLabel(monthKey)} subtotal
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-emerald-800">
                        {formatCurrency(monthAmount)}
                      </td>
                      <td className="px-3 py-1.5" />
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
                        <td colSpan={13} />
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 font-black text-white">
                  <td colSpan={7} className="px-3 py-2 text-right text-[10px] uppercase tracking-[0.2em] text-slate-300">
                    Grand total
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
                  <td className="px-3 py-2" />
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

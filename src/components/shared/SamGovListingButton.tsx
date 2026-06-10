import { ExternalLink } from 'lucide-react'
import type { Opportunity } from '../../types'

type SamGovOpportunityRef = Pick<Opportunity, 'link' | 'solicitationId' | 'solicitation'>

function normalizeExternalUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function getSamGovListingUrl(opportunity?: Partial<SamGovOpportunityRef> | null) {
  const directLink = normalizeExternalUrl(opportunity?.link ?? '')
  if (directLink) return directLink

  const searchTerm = (opportunity?.solicitationId || opportunity?.solicitation || '').trim()
  if (!searchTerm) return ''
  return `https://sam.gov/search/?index=opp&keywords=${encodeURIComponent(searchTerm)}`
}

export function openSamGovListing(opportunity?: Partial<SamGovOpportunityRef> | null) {
  const url = getSamGovListingUrl(opportunity)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

type SamGovListingButtonProps = {
  opportunity?: Partial<SamGovOpportunityRef> | null
  label?: string
  compact?: boolean
  variant?: 'light' | 'premium' | 'menu'
  className?: string
  onOpened?: () => void
}

export default function SamGovListingButton({
  opportunity,
  label = 'SAM.gov',
  compact = false,
  variant = 'light',
  className = '',
  onOpened,
}: SamGovListingButtonProps) {
  const url = getSamGovListingUrl(opportunity)
  const disabled = !url

  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40'
  const size = compact ? 'h-8 px-2 text-[11px]' : 'px-3 py-2 text-xs'
  const variantClass =
    variant === 'premium'
      ? 'border border-[#7DD3FC]/30 bg-[#7DD3FC]/10 text-[#BAE6FD] hover:border-[#7DD3FC]/60 hover:bg-[#7DD3FC]/18 hover:text-white'
      : variant === 'menu'
        ? 'w-full justify-start rounded-none px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        : 'border border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100'

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? 'No SAM.gov reference available' : 'Open SAM.gov listing'}
      className={[base, size, variantClass, className].filter(Boolean).join(' ')}
      onClick={event => {
        event.stopPropagation()
        if (openSamGovListing(opportunity)) onOpened?.()
      }}
    >
      <ExternalLink size={compact ? 12 : 13} />
      {!compact && label}
    </button>
  )
}

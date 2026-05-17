/**
 * CE Solution Plus — Company Logo Component
 *
 * Logo is served from /public/logo.svg (vector, scales perfectly at any size).
 * Falls back to inline SVG if the file cannot load.
 */

interface CompanyLogoProps {
  /** collapsed sidebar: show only the CE monogram badge */
  variant?: 'full' | 'icon'
  className?: string
  /** height in px (full variant) */
  height?: number
}

export default function CompanyLogo({ variant = 'full', className = '', height = 40 }: CompanyLogoProps) {

  /* ── Collapsed sidebar: small dark badge with "CE" ── */
  if (variant === 'icon') {
    return (
      <div
        className={`flex items-center justify-center rounded-lg font-black text-white select-none flex-shrink-0 ${className}`}
        style={{
          width: 34, height: 34,
          background: '#0A0A0A',
          fontSize: 12,
          letterSpacing: '0.02em',
          fontFamily: "'Palatino Linotype', Palatino, Georgia, serif",
          fontStyle: 'italic',
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        }}
      >
        CE
      </div>
    )
  }

  /* ── Full logo: load the SVG file from /public ── */
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.svg`}
      alt="CE Solution Plus"
      style={{ height, width: 'auto', objectFit: 'contain' }}
      className={className}
      onError={(e) => {
        /* If SVG file fails, show inline fallback */
        const target = e.currentTarget
        target.style.display = 'none'
        const parent = target.parentElement
        if (parent && !parent.querySelector('.logo-fallback')) {
          const span = document.createElement('span')
          span.className = 'logo-fallback'
          span.style.cssText = `
            font-family: 'Palatino Linotype', Palatino, Georgia, serif;
            font-weight: 700; font-style: italic;
            font-size: ${height * 0.55}px; color: #0A0A0A; white-space: nowrap;
          `
          span.textContent = 'CE Solution Plus'
          parent.appendChild(span)
        }
      }}
    />
  )
}

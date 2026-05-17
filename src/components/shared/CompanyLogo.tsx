/**
 * CE Solution Plus — Company Logo Component
 *
 * DROP the logo file at:  /public/logo.png
 * (place the logo PNG in the `public/` folder at the project root)
 *
 * The component will show the PNG when available,
 * or fall back to an SVG text representation.
 */
import { useState } from 'react'

interface CompanyLogoProps {
  /** collapsed: show only the monogram; expanded: show full logo */
  variant?: 'full' | 'icon'
  className?: string
  /** height in px (full variant) */
  height?: number
}

export default function CompanyLogo({ variant = 'full', className = '', height = 40 }: CompanyLogoProps) {
  const [imgError, setImgError] = useState(false)

  if (variant === 'icon') {
    return (
      <div
        className={`flex items-center justify-center rounded-lg font-black text-white select-none flex-shrink-0 ${className}`}
        style={{
          width: 34, height: 34,
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          fontSize: 13,
          letterSpacing: '-0.02em',
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        }}
      >
        CE
      </div>
    )
  }

  // Full variant — try PNG first, fall back to SVG
  if (!imgError) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt="CE Solution Plus"
        height={height}
        style={{ height, width: 'auto', objectFit: 'contain' }}
        className={className}
        onError={() => setImgError(true)}
      />
    )
  }

  // SVG fallback — approximates the CE Solution Plus logo style
  return (
    <svg
      height={height}
      viewBox="0 0 320 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ height, width: 'auto' }}
    >
      {/* Decorative C·E monogram */}
      <text
        x="0" y="46"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="52"
        fontStyle="italic"
        fontWeight="700"
        fill="#0F172A"
        letterSpacing="-4"
      >CE</text>
      {/* Divider */}
      <line x1="70" y1="6" x2="70" y2="54" stroke="#0F172A" strokeWidth="1.5" opacity="0.3"/>
      {/* SOLUTION PLUS */}
      <text
        x="78" y="34"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="26"
        fontWeight="700"
        fill="#0F172A"
        letterSpacing="2"
      >SOLUTION PLUS</text>
      {/* Tagline */}
      <text
        x="79" y="50"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8"
        fontWeight="400"
        fill="#64748B"
        letterSpacing="2.5"
      >YOU HAVE A NEED, WE HAVE A SOLUTION</text>
    </svg>
  )
}

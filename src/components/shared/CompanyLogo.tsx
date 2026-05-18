interface CompanyLogoProps {
  variant?: 'full' | 'icon'
  className?: string
  height?: number
}

export default function CompanyLogo({ variant = 'full', className = '', height = 40 }: CompanyLogoProps) {
  const size = variant === 'icon' ? 38 : height

  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.avif`}
      alt="CE Solution Plus"
      className={className}
      style={{
        width: variant === 'icon' ? size : 'auto',
        height: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
    />
  )
}

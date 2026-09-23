type BrandMarkProps = {
  className?: string
  label?: string
}

export function BrandMark({ className = 'h-8 w-8', label = '' }: BrandMarkProps) {
  return <img src="/favicon.svg" alt={label} width={32} height={32} className={`block shrink-0 ${className}`} />
}

export function BrandHeading({ className = 'mb-8' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark />
      <p className="font-[family-name:var(--heading)] text-lg leading-none text-[var(--text-h)]">Reach</p>
    </div>
  )
}

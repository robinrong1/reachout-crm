type AvatarProps = {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const palettes = [
  { bg: '#d8f0c8', fg: '#2f5b24' },
  { bg: '#f8e0c8', fg: '#7a3e16' },
  { bg: '#dde7fb', fg: '#2a3f86' },
  { bg: '#f3d5ea', fg: '#7a2d5e' },
  { bg: '#d7f1ea', fg: '#1f5c52' },
  { bg: '#efe3c4', fg: '#6a4b12' },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

function paletteFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash + char.charCodeAt(0) * 17) % 997
  return palettes[hash % palettes.length]!
}

const sizes = {
  xs: 'h-5 w-5 text-[0.65rem]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const palette = paletteFor(name)
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${sizes[size]}`}
      style={{ background: palette.bg, color: palette.fg }}
    >
      {initials(name)}
    </span>
  )
}

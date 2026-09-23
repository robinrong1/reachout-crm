import { NavLink } from 'react-router'

type NavSnackbarProps = {
  current: 'home' | 'keep-in-touch' | 'contacts' | 'timeline' | 'settings'
}

const items = [
  { to: '/', end: true, current: 'home' as const, label: 'Home' },
  { to: '/keep-in-touch', end: false, current: 'keep-in-touch' as const, label: 'Catch up' },
  { to: '/contacts', end: false, current: 'contacts' as const, label: 'Contacts' },
  { to: '/timeline', end: false, current: 'timeline' as const, label: 'Timeline' },
]

export function NavSnackbar({ current }: NavSnackbarProps) {
  return (
    <nav className="nav-snackbar" aria-label="Main">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className="nav-snackbar-item"
          aria-current={current === item.current ? 'page' : undefined}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

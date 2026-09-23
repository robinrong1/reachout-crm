import { NavLink } from 'react-router'

type SidebarProps = {
  current: 'home' | 'keep-in-touch' | 'contacts' | 'timeline' | 'settings'
  email?: string | null
  onSignOut: () => void
}

export function Sidebar({ current, email, onSignOut }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-semibold text-white">
          R
        </span>
        <div>
          <p className="font-[family-name:var(--heading)] text-lg leading-none text-[var(--text-h)]">Reach</p>
          <p className="mt-1 text-xs text-[var(--text)]">Stay close to people</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Main">
        <NavLink to="/" end className="nav-item" aria-current={current === 'home' ? 'page' : undefined}>
          Home
        </NavLink>
        <NavLink
          to="/keep-in-touch"
          className="nav-item"
          aria-current={current === 'keep-in-touch' ? 'page' : undefined}
        >
          Catch up
        </NavLink>
        <NavLink
          to="/contacts"
          className="nav-item"
          end={false}
          aria-current={current === 'contacts' ? 'page' : undefined}
        >
          Contacts
        </NavLink>
        <NavLink
          to="/timeline"
          className="nav-item"
          aria-current={current === 'timeline' ? 'page' : undefined}
        >
          Timeline
        </NavLink>
      </nav>

      <div className="mt-auto border-t border-[var(--border)] pt-4">
        <NavLink
          to="/settings"
          className="nav-item mb-1"
          title={email ?? undefined}
          aria-current={current === 'settings' ? 'page' : undefined}
        >
          <span className="block truncate">{email || 'Account'}</span>
        </NavLink>
        <button type="button" className="nav-item" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}

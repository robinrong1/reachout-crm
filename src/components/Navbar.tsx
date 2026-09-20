type NavbarProps = {
  current: 'dashboard' | 'contacts'
  onDashboard: () => void
  onContacts: () => void
  onSignOut: () => void
}

export function Navbar({ current, onDashboard, onContacts, onSignOut }: NavbarProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="m-0 text-2xl font-medium tracking-tight text-[var(--text-h)]">Personal CRM</h1>
      <nav className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            current === 'dashboard' ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)]'
          }`}
          onClick={onDashboard}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${
            current === 'contacts' ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)]'
          }`}
          onClick={onContacts}
        >
          Contacts
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </nav>
    </header>
  )
}

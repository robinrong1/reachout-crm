import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

type TopBarProps = {
  compact?: boolean
}

export function TopBar({ compact = false }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const onList = location.pathname === '/contacts'
  const query = onList ? (searchParams.get('q') ?? '') : ''

  function goToSearch(nextQuery: string) {
    const next = new URLSearchParams(onList ? searchParams : undefined)
    if (nextQuery.trim()) next.set('q', nextQuery)
    else next.delete('q')
    const search = next.toString()
    navigate({ pathname: '/contacts', search: search ? `?${search}` : '' }, { replace: onList })
  }

  return (
    <header className="topbar">
      <form
        className="topbar-search"
        onSubmit={(event) => {
          event.preventDefault()
          goToSearch(query)
        }}
        role="search"
      >
        <label className="sr-only" htmlFor="people-search">
          Search contacts
        </label>
        <input
          id="people-search"
          className="input-field search-pill"
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(event) => goToSearch(event.target.value)}
        />
      </form>
      {compact ? null : (
        <Link to="/contacts/new" className="btn btn-primary whitespace-nowrap">
          + Add someone
        </Link>
      )}
    </header>
  )
}

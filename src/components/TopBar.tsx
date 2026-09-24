import { useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { listSearchOptions, type SearchOption } from '../lib/contacts'
import { rankPeople } from '../lib/peopleSearch'
import { Avatar } from './Avatar'
import { BrandMark } from './BrandMark'

type TopBarProps = {
  compact?: boolean
  assistantOpen?: boolean
  assistantButtonRef?: Ref<HTMLButtonElement>
  onToggleAssistant?: () => void
}

const LISTBOX_ID = 'people-search-results'

export function TopBar({ compact = false, assistantOpen = false, assistantButtonRef, onToggleAssistant }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const onList = location.pathname === '/contacts'

  const [draft, setDraft] = useState('')
  const [people, setPeople] = useState<SearchOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [lastPath, setLastPath] = useState(location.pathname)
  const loadRequest = useRef(0)
  const loadedThisFocus = useRef(false)

  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setDraft('')
    setOpen(false)
    setActiveIndex(-1)
  }

  const query = onList ? (searchParams.get('q') ?? '') : draft
  const matches = onList ? [] : rankPeople(people, draft)
  const showPanel = !onList && open && draft.trim() !== '' && (matches.length > 0 || !loading)
  const expanded = showPanel && matches.length > 0

  function loadPeople() {
    if (loadedThisFocus.current) return
    loadedThisFocus.current = true
    const request = ++loadRequest.current
    setLoading(true)
    void listSearchOptions().then(({ data }) => {
      if (request !== loadRequest.current) return
      if (data) setPeople(data)
      setLoading(false)
    })
  }

  function goToSearch(nextQuery: string) {
    const next = new URLSearchParams(onList ? searchParams : undefined)
    if (nextQuery.trim()) next.set('q', nextQuery)
    else next.delete('q')
    const search = next.toString()
    navigate({ pathname: '/contacts', search: search ? `?${search}` : '' }, { replace: onList })
  }

  function openPerson(person: SearchOption) {
    navigate(`/contacts/${person.id}`, { state: { from: `${location.pathname}${location.search}` } })
  }

  function closeAndClear() {
    setDraft('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function submit() {
    const highlighted = expanded ? matches[activeIndex] : undefined
    if (highlighted) openPerson(highlighted)
    else goToSearch(query)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (onList) return
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => {
        if (current === -1) return step === 1 ? 0 : matches.length - 1
        const next = current + step
        return next < 0 || next >= matches.length ? -1 : next
      })
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeAndClear()
    }
  }

  return (
    <header className="topbar">
      <Link to="/" className="shrink-0 md:hidden" aria-label="Home">
        <BrandMark />
      </Link>
      <form
        className="topbar-search"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        role="search"
      >
        <label className="sr-only" htmlFor="people-search">
          Search people
        </label>
        <input
          id="people-search"
          className="input-field search-pill"
          type="search"
          placeholder="Search people…"
          autoComplete="off"
          role={onList ? undefined : 'combobox'}
          aria-autocomplete={onList ? undefined : 'list'}
          aria-expanded={onList ? undefined : expanded}
          aria-controls={onList ? undefined : LISTBOX_ID}
          aria-activedescendant={expanded && activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined}
          value={query}
          onFocus={() => {
            if (onList) return
            loadPeople()
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
            loadedThisFocus.current = false
          }}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            if (onList) {
              goToSearch(event.target.value)
              return
            }
            loadPeople()
            setDraft(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
        />
        {showPanel ? (
          <div className="search-results">
            {matches.length > 0 ? (
              <ul id={LISTBOX_ID} role="listbox" aria-label="People">
                {matches.map((person, index) => (
                  <li
                    key={person.id}
                    id={`${LISTBOX_ID}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="search-result"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openPerson(person)}
                  >
                    <Avatar name={person.name} size="sm" />
                    <span className="min-w-0">
                      <span className="search-result-name">{person.name}</span>
                      {person.relationship_type ? (
                        <span className="search-result-meta">{person.relationship_type}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="search-results-empty">No one matches. Press Enter to search Contacts.</p>
            )}
          </div>
        ) : null}
      </form>
      {onToggleAssistant ? (
        <button
          ref={assistantButtonRef}
          type="button"
          className="btn btn-secondary assistant-toggle whitespace-nowrap"
          aria-expanded={assistantOpen}
          aria-controls="assistant-panel"
          onClick={onToggleAssistant}
        >
          Ask
        </button>
      ) : null}
      {compact ? null : (
        <Link to="/contacts/new" className="btn btn-primary whitespace-nowrap">
          + Add someone
        </Link>
      )}
    </header>
  )
}

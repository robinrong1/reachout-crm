import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { filterDirectory, sortDirectory, type DirectorySort, type SortDir } from '../lib/contactDirectory'
import { CADENCE_PRESETS, formatCadence } from '../lib/cadence'
import { archiveContact, listContacts, unarchiveContact, type ContactListItem } from '../lib/contacts'
import {
  addContactToGroup,
  createGroup,
  deleteGroup,
  listGroups,
  removeContactFromGroup,
  renameGroup,
  setGroupCadence,
} from '../lib/groups'
import { useDataVersion } from '../lib/useDataVersion'
import { formatDisplayDate } from '../utils/dates'
import type { Group } from '../types/database'

export function ContactList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const groupFilter = searchParams.get('group') ?? 'all'
  const showArchived = searchParams.get('archived') === '1'

  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<DirectorySort>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [newGroupName, setNewGroupName] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [pickerId, setPickerId] = useState<string | null>(null)
  const dataVersion = useDataVersion()

  async function load(archived: boolean) {
    const [contactResult, groupResult] = await Promise.all([listContacts(archived), listGroups()])
    if (contactResult.error) {
      setError(contactResult.error.message)
      setContacts([])
    } else {
      setContacts(contactResult.data ?? [])
    }
    if (groupResult.error) {
      setError(groupResult.error.message)
      setGroups([])
    } else {
      setGroups(groupResult.data ?? [])
    }
    if (!contactResult.error && !groupResult.error) setError(null)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([listContacts(showArchived), listGroups()]).then(([contactResult, groupResult]) => {
      if (cancelled) return
      if (contactResult.error) {
        setError(contactResult.error.message)
        setContacts([])
      } else {
        setContacts(contactResult.data ?? [])
      }
      if (groupResult.error) {
        setError(groupResult.error.message)
        setGroups([])
      } else {
        setGroups(groupResult.data ?? [])
      }
      if (!contactResult.error && !groupResult.error) setError(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [showArchived, dataVersion])

  const visible = useMemo(
    () => sortDirectory(filterDirectory(contacts, query, groupFilter), sort, sortDir),
    [contacts, query, groupFilter, sort, sortDir],
  )

  function patchParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    setSearchParams(next, { replace: true })
  }

  function toggleSort(column: DirectorySort) {
    if (sort === column) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSort(column)
    setSortDir(column === 'last_talked' ? 'desc' : 'asc')
  }

  async function handleArchiveToggle(contact: ContactListItem) {
    const result = contact.archived ? await unarchiveContact(contact.id) : await archiveContact(contact.id)
    if (result.error) {
      setError(result.error.message)
      return
    }
    await load(showArchived)
  }

  async function handleCreateGroup() {
    const { data, error } = await createGroup(newGroupName)
    if (error) {
      setError(error.message.includes('groups_name_unique') ? 'You already have a group with that name.' : error.message)
      return
    }
    if (data) {
      setGroups((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewGroupName('')
      setAddingGroup(false)
    }
  }

  async function handleRenameSelected() {
    if (groupFilter === 'all') return
    const current = groups.find((group) => group.id === groupFilter)
    const nextName = window.prompt('Rename group', current?.name ?? '')
    if (nextName == null) return
    const { data, error } = await renameGroup(groupFilter, nextName)
    if (error) {
      setError(error.message.includes('groups_name_unique') ? 'You already have a group with that name.' : error.message)
      return
    }
    if (data) {
      setGroups((current) => current.map((group) => (group.id === data.id ? data : group)))
    }
  }

  async function handleDeleteSelected() {
    if (groupFilter === 'all') return
    if (!window.confirm('Delete this group? People stay; they are just ungrouped.')) return
    const { error } = await deleteGroup(groupFilter)
    if (error) {
      setError(error.message)
      return
    }
    setGroups((current) => current.filter((group) => group.id !== groupFilter))
    patchParams((next) => next.delete('group'))
    await load(showArchived)
  }

  async function confirmGroupCadence(days: number, label: string) {
    const group = groups.find((item) => item.id === groupFilter)
    if (!group) return
    const confirmed = window.confirm(
      `Set everyone in ${group.name} to ${label}? This updates people in the group right now. People you add later keep their own cadence.`,
    )
    if (!confirmed) return
    const { error: cadenceError } = await setGroupCadence(group.id, days)
    if (cadenceError) {
      setError(cadenceError.message)
      return
    }
    await load(showArchived)
  }

  async function toggleMembership(contact: ContactListItem, groupId: string) {
    const belongs = contact.group_ids.includes(groupId)
    const result = belongs
      ? await removeContactFromGroup(contact.id, groupId)
      : await addContactToGroup(contact.id, groupId)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setContacts((current) =>
      current.map((row) => {
        if (row.id !== contact.id) return row
        return {
          ...row,
          group_ids: belongs ? row.group_ids.filter((id) => id !== groupId) : [...row.group_ids, groupId],
        }
      }),
    )
  }

  const countLabel = visible.length === 1 ? '1 person' : `${visible.length} people`
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]))

  return (
    <section className="page-shell directory-shell" aria-labelledby="contacts-heading" aria-busy={loading}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="masthead">
          <p className="masthead-eyebrow">{loading ? 'Directory' : countLabel}</p>
          <h2 id="contacts-heading" className="masthead-title">
            {showArchived ? 'Archived' : 'All contacts'}
          </h2>
        </div>
        <button
          type="button"
          className="text-link self-start"
          onClick={() => {
            setLoading(true)
            patchParams((next) => {
              if (showArchived) next.delete('archived')
              else next.set('archived', '1')
            })
          }}
        >
          {showArchived ? 'View contacts' : 'View archived'}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip"
          aria-pressed={groupFilter === 'all'}
          onClick={() => patchParams((next) => next.delete('group'))}
        >
          All contacts
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="chip"
            aria-pressed={groupFilter === group.id}
            onClick={() =>
              patchParams((next) => {
                next.set('group', group.id)
              })
            }
          >
            {group.name}
          </button>
        ))}
        {addingGroup ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreateGroup()
            }}
          >
            <input
              className="input-field w-40"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Group name"
              aria-label="New group name"
              autoFocus
            />
            <button type="submit" className="btn btn-secondary">
              Save
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAddingGroup(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="chip" onClick={() => setAddingGroup(true)}>
            +
          </button>
        )}
        {groupFilter !== 'all' ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => void handleRenameSelected()}>
              Rename
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void handleDeleteSelected()}>
              Delete group
            </button>
          </>
        ) : null}
      </div>

      {groupFilter !== 'all' ? (
        <div className="flex flex-wrap items-center gap-2">
          {CADENCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn btn-ghost"
              onClick={() => void confirmGroupCadence(preset.days, preset.label)}
            >
              Set everyone to {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setLoading(true)
            setError(null)
            void load(showArchived)
          }}
        />
      ) : null}

      {loading ? <p role="status">Loading contacts…</p> : null}

      {!loading && contacts.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Nobody is archived.' : 'Your people live here.'}
          body={showArchived ? undefined : 'Add a friend, family member, or anyone you want to stay close to.'}
        />
      ) : null}

      {!loading && contacts.length > 0 && visible.length === 0 ? (
        <EmptyState title="No matches." body="Try a different search or group." />
      ) : null}

      {!loading && visible.length > 0 ? (
        <div className="directory-frame">
          <table className="people-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('name')}>
                    Name{sort === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
                <th>How you know them</th>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('cadence')}>
                    How often{sort === 'cadence' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
                <th>Groups</th>
                <th>
                  <button type="button" className="sort-btn" onClick={() => toggleSort('last_talked')}>
                    Last talked{sort === 'last_talked' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <Link to={`/contacts/${contact.id}`} className="flex items-center gap-3 text-[var(--text-h)] no-underline">
                      <Avatar name={contact.name} size="sm" />
                      <span className="font-medium">{contact.name}</span>
                    </Link>
                  </td>
                  <td className="text-[var(--text)]">{contact.relationship_type || '—'}</td>
                  <td className="text-[var(--text)]">{formatCadence(contact.cadence_days)}</td>
                  <td className="relative">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-expanded={pickerId === contact.id}
                      onClick={() => setPickerId((id) => (id === contact.id ? null : contact.id))}
                    >
                      {contact.group_ids.length === 0
                        ? 'Set groups'
                        : contact.group_ids
                            .map((id) => groupNameById.get(id))
                            .filter(Boolean)
                            .join(', ')}
                    </button>
                    {pickerId === contact.id ? (
                      <div className="group-picker">
                        {groups.length === 0 ? (
                          <p className="px-2 py-1 text-sm">Create a group above first.</p>
                        ) : (
                          groups.map((group) => (
                            <label key={group.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={contact.group_ids.includes(group.id)}
                                onChange={() => void toggleMembership(contact, group.id)}
                              />
                              {group.name}
                            </label>
                          ))
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-[var(--text)]">
                    {contact.last_occurred_on ? formatDisplayDate(contact.last_occurred_on) : 'Never'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={contact.archived ? `Unarchive ${contact.name}` : `Archive ${contact.name}`}
                      onClick={() => void handleArchiveToggle(contact)}
                    >
                      {contact.archived ? 'Unarchive' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

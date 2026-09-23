import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '../utils/dates'
import {
  createTestUser,
  deleteTestUser,
  hasIntegrationEnv,
  type TestUser,
  utcToday,
} from './harness'

describe.skipIf(!hasIntegrationEnv())('database CRUD', () => {
  let user: TestUser | undefined
  const idsToDelete: string[] = []

  beforeAll(async () => {
    user = await createTestUser()
    idsToDelete.push(user.id)
  })

  afterAll(async () => {
    for (const id of idsToDelete) {
      await deleteTestUser(id)
    }
  })

  it('creates, reads, updates, and archives a contact', async () => {
    if (!user) throw new Error('setup failed')

    const created = await user.client
      .from('contacts')
      .insert({
        user_id: user.id,
        name: 'Sarah',
        relationship_type: 'friend',
        cadence_days: 14,
        notes: 'college',
      })
      .select()
      .single()

    expect(created.error).toBeNull()
    expect(created.data?.name).toBe('Sarah')
    expect(created.data?.cadence_days).toBe(14)

    const listed = await user.client.from('contacts').select('*').eq('archived', false)
    expect(listed.error).toBeNull()
    expect(listed.data?.map((row) => row.id)).toContain(created.data!.id)

    const updated = await user.client
      .from('contacts')
      .update({ cadence_days: 30, notes: 'updated' })
      .eq('id', created.data!.id)
      .select()
      .single()

    expect(updated.error).toBeNull()
    expect(updated.data?.cadence_days).toBe(30)
    expect(updated.data?.notes).toBe('updated')

    const archived = await user.client
      .from('contacts')
      .update({ archived: true })
      .eq('id', created.data!.id)
      .select()
      .single()

    expect(archived.error).toBeNull()
    expect(archived.data?.archived).toBe(true)

    const active = await user.client.from('contacts').select('*').eq('archived', false)
    expect(active.data?.map((row) => row.id)).not.toContain(created.data!.id)
  })

  it('rejects cadence_days that are not greater than 0', async () => {
    if (!user) throw new Error('setup failed')

    const { error } = await user.client.from('contacts').insert({
      user_id: user.id,
      name: 'Invalid cadence',
      cadence_days: 0,
    })

    expect(error).not.toBeNull()
  })

  it('creates, updates, and deletes an interaction', async () => {
    if (!user) throw new Error('setup failed')
    const today = utcToday()

    const contact = await user.client
      .from('contacts')
      .insert({ user_id: user.id, name: 'Marcus', cadence_days: 30 })
      .select()
      .single()
    expect(contact.error).toBeNull()

    const created = await user.client
      .from('interactions')
      .insert({
        contact_id: contact.data!.id,
        occurred_on: addDays(today, -3),
        note: 'coffee',
      })
      .select()
      .single()
    expect(created.error).toBeNull()
    expect(created.data?.note).toBe('coffee')

    const updated = await user.client
      .from('interactions')
      .update({ note: 'called instead', occurred_on: today })
      .eq('id', created.data!.id)
      .select()
      .single()
    expect(updated.error).toBeNull()
    expect(updated.data?.note).toBe('called instead')
    expect(updated.data?.occurred_on).toBe(today)

    const removed = await user.client.from('interactions').delete().eq('id', created.data!.id)
    expect(removed.error).toBeNull()

    const remaining = await user.client
      .from('interactions')
      .select('*')
      .eq('contact_id', contact.data!.id)
    expect(remaining.data).toEqual([])
  })

  it('lists a contact with no interactions as due now, then clears them after a talk today', async () => {
    if (!user) throw new Error('setup failed')
    const today = utcToday()

    const contact = await user.client
      .from('contacts')
      .insert({ user_id: user.id, name: 'Never talked', cadence_days: 30 })
      .select()
      .single()
    expect(contact.error).toBeNull()

    const overdue = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(overdue.error).toBeNull()
    expect(overdue.data).not.toBeNull()
    expect(overdue.data?.last_contact_date).toBeNull()
    expect(overdue.data?.days_overdue).toBe(0)

    const talked = await user.client.from('interactions').insert({
      contact_id: contact.data!.id,
      occurred_on: today,
    })
    expect(talked.error).toBeNull()

    const cleared = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(cleared.error).toBeNull()
    expect(cleared.data).toBeNull()
  })

  it('hides a snoozed contact until that date, and a conversation clears the snooze', async () => {
    if (!user) throw new Error('setup failed')
    const today = utcToday()

    const contact = await user.client
      .from('contacts')
      .insert({
        user_id: user.id,
        name: 'Snoozed person',
        cadence_days: 30,
        snoozed_until: addDays(today, 7),
      })
      .select()
      .single()
    expect(contact.error).toBeNull()

    const hidden = await user.client
      .from('overdue_contacts')
      .select('id')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(hidden.data).toBeNull()

    const dueAgain = await user.client
      .from('contacts')
      .update({ snoozed_until: today })
      .eq('id', contact.data!.id)
      .select('id')
      .single()
    expect(dueAgain.error).toBeNull()

    const back = await user.client
      .from('overdue_contacts')
      .select('id')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(back.data?.id).toBe(contact.data!.id)

    const talked = await user.client.from('interactions').insert({
      contact_id: contact.data!.id,
      occurred_on: today,
    })
    expect(talked.error).toBeNull()

    const cleared = await user.client
      .from('contacts')
      .select('snoozed_until')
      .eq('id', contact.data!.id)
      .single()
    expect(cleared.data?.snoozed_until).toBeNull()

    const gone = await user.client
      .from('overdue_contacts')
      .select('id')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(gone.data).toBeNull()
  })

  it('does not list archived contacts in overdue_contacts', async () => {
    if (!user) throw new Error('setup failed')
    const today = utcToday()

    const contact = await user.client
      .from('contacts')
      .insert({
        user_id: user.id,
        name: 'Archived overdue',
        cadence_days: 7,
        archived: true,
      })
      .select()
      .single()
    expect(contact.error).toBeNull()

    const interaction = await user.client.from('interactions').insert({
      contact_id: contact.data!.id,
      occurred_on: addDays(today, -30),
    })
    expect(interaction.error).toBeNull()

    const overdue = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact.data!.id)
      .maybeSingle()
    expect(overdue.error).toBeNull()
    expect(overdue.data).toBeNull()
  })

  it('assigns a contact to a group the owner created', async () => {
    if (!user) throw new Error('setup failed')

    const contact = await user.client
      .from('contacts')
      .insert({ user_id: user.id, name: 'Grouped person', cadence_days: 30 })
      .select()
      .single()
    expect(contact.error).toBeNull()

    const group = await user.client
      .from('groups')
      .insert({ user_id: user.id, name: 'Family' })
      .select()
      .single()
    expect(group.error).toBeNull()

    const membership = await user.client.from('contact_groups').insert({
      contact_id: contact.data!.id,
      group_id: group.data!.id,
    })
    expect(membership.error).toBeNull()

    const listed = await user.client
      .from('contact_groups')
      .select('contact_id')
      .eq('group_id', group.data!.id)
    expect(listed.data?.map((row) => row.contact_id)).toContain(contact.data!.id)
  })
})

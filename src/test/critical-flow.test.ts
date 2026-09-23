import { afterAll, describe, expect, it } from 'vitest'
import { addDays } from '../utils/dates'
import {
  createTestUser,
  deleteTestUser,
  hasIntegrationEnv,
  type TestUser,
  utcToday,
} from './harness'

/**
 * Spec section 19 / Phase 9: one complete loop.
 * "Advance date" is done by writing an old occurred_on so the live
 * overdue_contacts view (which uses now()) treats the contact as overdue.
 */
describe.skipIf(!hasIntegrationEnv())('critical flow: signup → contact → interaction → overdue → reached out', () => {
  const idsToDelete: string[] = []

  afterAll(async () => {
    for (const id of idsToDelete) {
      await deleteTestUser(id)
    }
  })

  it('clears overdue after a reached-out-today interaction', async () => {
    const user: TestUser = await createTestUser('UTC')
    idsToDelete.push(user.id)
    const today = utcToday()
    const lastTalked = addDays(today, -40)

    const { data: contact, error: contactError } = await user.client
      .from('contacts')
      .insert({
        user_id: user.id,
        name: 'Jamie',
        relationship_type: 'mentor',
        cadence_days: 30,
      })
      .select()
      .single()
    expect(contactError).toBeNull()
    expect(contact?.name).toBe('Jamie')

    const { error: interactionError } = await user.client.from('interactions').insert({
      contact_id: contact!.id,
      occurred_on: lastTalked,
      note: 'catch up call',
    })
    expect(interactionError).toBeNull()

    const overdueBefore = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact!.id)
      .maybeSingle()
    expect(overdueBefore.error).toBeNull()
    expect(overdueBefore.data).not.toBeNull()
    expect(overdueBefore.data?.days_overdue).toBeGreaterThanOrEqual(0)
    expect(overdueBefore.data?.last_contact_date).toBe(lastTalked)
    expect(overdueBefore.data?.cadence_days).toBe(30)

    const { error: reachedOutError } = await user.client.from('interactions').insert({
      contact_id: contact!.id,
      occurred_on: today,
    })
    expect(reachedOutError).toBeNull()

    const overdueAfter = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact!.id)
      .maybeSingle()
    expect(overdueAfter.error).toBeNull()
    expect(overdueAfter.data).toBeNull()
  })

  it('lists a new contact with no interactions as due now', async () => {
    const user: TestUser = await createTestUser('UTC')
    idsToDelete.push(user.id)
    const today = utcToday()

    const { data: contact, error: contactError } = await user.client
      .from('contacts')
      .insert({
        user_id: user.id,
        name: 'New person',
        cadence_days: 30,
      })
      .select()
      .single()
    expect(contactError).toBeNull()

    const overdue = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact!.id)
      .maybeSingle()
    expect(overdue.error).toBeNull()
    expect(overdue.data?.last_contact_date).toBeNull()
    expect(overdue.data?.days_overdue).toBe(0)

    const { error: reachedOutError } = await user.client.from('interactions').insert({
      contact_id: contact!.id,
      occurred_on: today,
    })
    expect(reachedOutError).toBeNull()

    const cleared = await user.client
      .from('overdue_contacts')
      .select('*')
      .eq('id', contact!.id)
      .maybeSingle()
    expect(cleared.data).toBeNull()
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashMcpToken } from '../lib/mcpToken'
import { addDays } from '../utils/dates'
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  hasIntegrationEnv,
  type TestUser,
  utcToday,
} from './harness'

describe.skipIf(!hasIntegrationEnv())('row level security', () => {
  let owner: TestUser | undefined
  let other: TestUser | undefined
  const idsToDelete: string[] = []
  let contactId = ''
  let interactionId = ''

  beforeAll(async () => {
    owner = await createTestUser()
    other = await createTestUser()
    idsToDelete.push(owner.id, other.id)

    const contact = await owner.client
      .from('contacts')
      .insert({
        user_id: owner.id,
        name: 'Private person',
        cadence_days: 30,
        notes: 'should never leak',
      })
      .select()
      .single()
    if (contact.error || !contact.data) throw contact.error ?? new Error('contact insert failed')
    contactId = contact.data.id

    const interaction = await owner.client
      .from('interactions')
      .insert({
        contact_id: contactId,
        occurred_on: addDays(utcToday(), -10),
        note: 'secret note',
      })
      .select()
      .single()
    if (interaction.error || !interaction.data) {
      throw interaction.error ?? new Error('interaction insert failed')
    }
    interactionId = interaction.data.id
  })

  afterAll(async () => {
    for (const id of idsToDelete) {
      await deleteTestUser(id)
    }
  })

  it('lets the owner read their contact and interaction', async () => {
    if (!owner) throw new Error('setup failed')

    const contact = await owner.client.from('contacts').select('*').eq('id', contactId).maybeSingle()
    expect(contact.data?.name).toBe('Private person')

    const interaction = await owner.client
      .from('interactions')
      .select('*')
      .eq('id', interactionId)
      .maybeSingle()
    expect(interaction.data?.note).toBe('secret note')
  })

  it('hides another user\'s contacts and interactions from SELECT', async () => {
    if (!other) throw new Error('setup failed')

    const contact = await other.client.from('contacts').select('*').eq('id', contactId)
    expect(contact.error).toBeNull()
    expect(contact.data).toEqual([])

    const interaction = await other.client.from('interactions').select('*').eq('id', interactionId)
    expect(interaction.error).toBeNull()
    expect(interaction.data).toEqual([])

    const overdue = await other.client.from('overdue_contacts').select('*').eq('id', contactId)
    expect(overdue.error).toBeNull()
    expect(overdue.data).toEqual([])
  })

  it('still has the rows when queried with the service role (so empty SELECT is RLS, not missing data)', async () => {
    const admin = adminClient()
    const contact = await admin.from('contacts').select('id, user_id').eq('id', contactId).single()
    expect(contact.data?.id).toBe(contactId)
    expect(contact.data?.user_id).toBe(owner?.id)
  })

  it('blocks inserting an interaction on another user\'s contact', async () => {
    if (!other) throw new Error('setup failed')

    const { data, error } = await other.client
      .from('interactions')
      .insert({ contact_id: contactId, occurred_on: utcToday(), note: 'intrusion' })
      .select()

    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('blocks updating or deleting another user\'s contact', async () => {
    if (!other) throw new Error('setup failed')

    const updated = await other.client
      .from('contacts')
      .update({ name: 'Hijacked' })
      .eq('id', contactId)
      .select()
    expect(updated.data).toEqual([])

    const deleted = await other.client.from('contacts').delete().eq('id', contactId).select()
    expect(deleted.data).toEqual([])

    const stillThere = await adminClient()
      .from('contacts')
      .select('name')
      .eq('id', contactId)
      .single()
    expect(stillThere.data?.name).toBe('Private person')
  })

  it('blocks creating a contact owned by someone else', async () => {
    if (!owner || !other) throw new Error('setup failed')

    const { data, error } = await other.client
      .from('contacts')
      .insert({
        user_id: owner.id,
        name: 'Forged ownership',
        cadence_days: 30,
      })
      .select()

    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('hides another user\'s groups and blocks forging memberships', async () => {
    if (!owner || !other) throw new Error('setup failed')

    const group = await owner.client
      .from('groups')
      .insert({ user_id: owner.id, name: 'Private circle' })
      .select()
      .single()
    expect(group.error).toBeNull()
    const groupId = group.data!.id

    const membership = await owner.client.from('contact_groups').insert({
      contact_id: contactId,
      group_id: groupId,
    })
    expect(membership.error).toBeNull()

    const otherGroups = await other.client.from('groups').select('*').eq('id', groupId)
    expect(otherGroups.error).toBeNull()
    expect(otherGroups.data).toEqual([])

    const otherMemberships = await other.client.from('contact_groups').select('*').eq('group_id', groupId)
    expect(otherMemberships.error).toBeNull()
    expect(otherMemberships.data).toEqual([])

    const forgedGroup = await other.client
      .from('groups')
      .insert({ user_id: owner.id, name: 'Stolen' })
      .select()
    expect(forgedGroup.data).toBeNull()
    expect(forgedGroup.error).not.toBeNull()

    const forgedMembership = await other.client
      .from('contact_groups')
      .insert({ contact_id: contactId, group_id: groupId })
      .select()
    expect(forgedMembership.data).toBeNull()
    expect(forgedMembership.error).not.toBeNull()
  })

  it('hides the Gmail refresh token and another user\'s connection', async () => {
    if (!owner || !other) throw new Error('setup failed')

    const connection = await adminClient()
      .from('google_connections')
      .insert({
        user_id: owner.id,
        refresh_token_enc: 'ciphertext-not-for-the-client',
        scopes: 'https://www.googleapis.com/auth/gmail.metadata',
      })
      .select('id')
      .single()
    expect(connection.error).toBeNull()

    const status = await owner.client
      .from('google_connections')
      .select('id, scopes, connected_at, last_synced_at')
      .eq('id', connection.data!.id)
      .single()
    expect(status.error).toBeNull()
    expect(status.data?.scopes).toContain('gmail.metadata')

    const secret = await owner.client.from('google_connections').select('refresh_token_enc').single()
    expect(secret.error).not.toBeNull()

    const hidden = await other.client.from('google_connections').select('id').eq('id', connection.data!.id)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toEqual([])

    const removed = await owner.client.from('google_connections').delete().eq('id', connection.data!.id)
    expect(removed.error).toBeNull()
  })

  it('lets the owner see an assistant token label and hides the hash and other users', async () => {
    if (!owner || !other) throw new Error('setup failed')

    const token = await adminClient()
      .from('mcp_tokens')
      .insert({
        user_id: owner.id,
        token_hash: await hashMcpToken('reach_rls_test_token'),
        label: 'Claude',
      })
      .select('id')
      .single()
    expect(token.error).toBeNull()

    const listed = await owner.client
      .from('mcp_tokens')
      .select('id, label, revoked_at')
      .eq('id', token.data!.id)
      .single()
    expect(listed.error).toBeNull()
    expect(listed.data?.label).toBe('Claude')

    const hash = await owner.client.from('mcp_tokens').select('token_hash').eq('id', token.data!.id).single()
    expect(hash.error).not.toBeNull()

    const hidden = await other.client.from('mcp_tokens').select('id').eq('id', token.data!.id)
    expect(hidden.error).toBeNull()
    expect(hidden.data).toEqual([])
  })

  it('reports a password on accounts that chose one', async () => {
    if (!owner) throw new Error('setup failed')
    const result = await owner.client.rpc('account_has_password')
    expect(result.error).toBeNull()
    expect(result.data).toBe(true)
  })

  it('reports no password on a link-only account', async () => {
    const email = `crm-nopw-${crypto.randomUUID()}@example.com`
    const admin = adminClient()
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (created.error || !created.data.user) throw created.error ?? new Error('could not create link-only user')
    idsToDelete.push(created.data.user.id)

    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link.data.properties?.hashed_token
    if (link.error || !tokenHash) throw link.error ?? new Error('could not create a sign-in link')

    const client = anonClient()
    const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (verified.error) throw verified.error

    const result = await client.rpc('account_has_password')
    expect(result.error).toBeNull()
    expect(result.data).toBe(false)
  })
})

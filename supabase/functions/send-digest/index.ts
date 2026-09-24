import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isDigestDue, reminderWasSentOnLocalDate, todayInTimeZone } from '../_shared/dates.ts'
import { formatDigestEmail, type DigestContact } from '../_shared/digest.ts'
import { primaryGroupName } from '../../../src/lib/groupHeadings.ts'
import { reachOutExpiry, signReachOutToken } from '../_shared/token.ts'

/**
 * Weekly digest job.
 *
 * Secrets: CRON_SECRET, RESEND_API_KEY, RESEND_FROM, DIGEST_TOKEN_SECRET
 * Invoke: Authorization: Bearer <CRON_SECRET>
 * Schedule: hourly cron is enough; users are filtered by local digest_day_of_week.
 *
 * Failure: if Resend fails, reminders_sent is not written, so a later run can retry.
 * If Resend succeeds and the insert fails, a later run may send a second email.
 */

type UserRow = {
  id: string
  email: string
  timezone: string | null
  digest_day_of_week: number | null
}

type OverdueRow = {
  id: string
  name: string
  days_overdue: number
  last_contact_date: string | null
  nudge: string | null
}

type ReminderRow = {
  contact_id: string
  sent_at: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('Authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const resendFrom = Deno.env.get('RESEND_FROM')
  const tokenSecret = Deno.env.get('DIGEST_TOKEN_SECRET')

  if (!supabaseUrl || !serviceKey || !resendKey || !resendFrom || !tokenSecret) {
    console.error(JSON.stringify({ event: 'digest_job_failed', message: 'Missing function secrets' }))
    return json({ error: 'Missing function secrets' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const log = {
    usersConsidered: 0,
    overdueContactsFound: 0,
    skippedWrongDay: 0,
    skippedAlreadySent: 0,
    skippedNoneOverdue: 0,
    emailsSent: 0,
    emailsFailed: 0,
    errors: [] as string[],
  }

  console.log(JSON.stringify({ event: 'digest_job_started' }))

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, timezone, digest_day_of_week')

  if (usersError) {
    console.error(JSON.stringify({ event: 'digest_job_failed', message: usersError.message }))
    return json({ error: usersError.message }, 500)
  }

  for (const user of (users ?? []) as UserRow[]) {
    log.usersConsidered += 1
    const timeZone = user.timezone || 'UTC'
    const digestDay = user.digest_day_of_week ?? 1

    try {
      if (!isDigestDue(digestDay, timeZone, now)) {
        log.skippedWrongDay += 1
        continue
      }

      const { data: overdue, error: overdueError } = await supabase
        .from('overdue_contacts')
        .select('id, name, days_overdue, last_contact_date, nudge')
        .eq('user_id', user.id)
        .order('days_overdue', { ascending: false })

      if (overdueError) throw overdueError

      const contacts = (overdue ?? []) as OverdueRow[]
      log.overdueContactsFound += contacts.length
      if (contacts.length === 0) {
        log.skippedNoneOverdue += 1
        continue
      }

      const contactIds = contacts.map((contact) => contact.id)
      const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
      const { data: sentRows, error: sentError } = await supabase
        .from('reminders_sent')
        .select('contact_id, sent_at')
        .in('contact_id', contactIds)
        .gte('sent_at', since)

      if (sentError) throw sentError

      const localToday = todayInTimeZone(timeZone, now)
      const alreadySentToday = ((sentRows ?? []) as ReminderRow[]).some((row) =>
        reminderWasSentOnLocalDate(row.sent_at, timeZone, localToday),
      )

      if (alreadySentToday) {
        log.skippedAlreadySent += 1
        continue
      }

      const reachOutBase = `${supabaseUrl}/functions/v1/reach-out`
      const reachOutUrls: Record<string, string> = {}
      const snoozeUrls: Record<string, string> = {}
      for (const contact of contacts) {
        const exp = reachOutExpiry(now.getTime())
        const token = await signReachOutToken(tokenSecret, {
          userId: user.id,
          contactId: contact.id,
          exp,
        })
        const snoozeToken = await signReachOutToken(tokenSecret, {
          userId: user.id,
          contactId: contact.id,
          exp,
          action: 'snooze',
        })
        reachOutUrls[contact.id] = `${reachOutBase}?t=${encodeURIComponent(token)}`
        snoozeUrls[contact.id] = `${reachOutBase}?t=${encodeURIComponent(snoozeToken)}`
      }

      const groupNames = await groupNamesFor(supabase, user.id, contactIds)
      const digestContacts: DigestContact[] = contacts.map((contact) => ({
        ...contact,
        group_name: groupNames.get(contact.id) ?? null,
      }))
      const email = formatDigestEmail(digestContacts, reachOutUrls, snoozeUrls)
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [user.email],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      })

      if (!resendResponse.ok) {
        const body = await resendResponse.text()
        throw new Error(`Resend ${resendResponse.status}: ${body}`)
      }

      const { error: insertError } = await supabase.from('reminders_sent').insert(
        contacts.map((contact) => ({ contact_id: contact.id })),
      )
      if (insertError) throw insertError

      log.emailsSent += 1
      console.log(
        JSON.stringify({
          event: 'digest_sent',
          userId: user.id,
          overdueCount: contacts.length,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.errors.push(`${user.id}: ${message}`)
      log.emailsFailed += 1
      console.error(JSON.stringify({ event: 'digest_user_failed', userId: user.id, message }))
    }
  }

  console.log(JSON.stringify({ event: 'digest_job_finished', ...log }))
  return json(log)
})

function groupsSchemaMissing(error: { message: string; code?: string }) {
  const message = error.message.toLowerCase()
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

async function groupNamesFor(supabase: SupabaseClient, userId: string, contactIds: string[]) {
  const names = new Map<string, string | null>()
  for (const id of contactIds) names.set(id, null)

  const { data: groups, error: groupsError } = await supabase.from('groups').select('id, name').eq('user_id', userId)
  if (groupsError) {
    if (groupsSchemaMissing(groupsError)) return names
    throw groupsError
  }

  const { data: memberships, error: memberError } = await supabase
    .from('contact_groups')
    .select('contact_id, group_id')
    .in('contact_id', contactIds)
  if (memberError) {
    if (groupsSchemaMissing(memberError)) return names
    throw memberError
  }

  const named = (groups ?? []) as { id: string; name: string }[]
  const idsByContact = new Map<string, string[]>()
  for (const row of (memberships ?? []) as { contact_id: string; group_id: string }[]) {
    const list = idsByContact.get(row.contact_id) ?? []
    list.push(row.group_id)
    idsByContact.set(row.contact_id, list)
  }
  for (const id of contactIds) {
    names.set(id, primaryGroupName(idsByContact.get(id) ?? [], named))
  }
  return names
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

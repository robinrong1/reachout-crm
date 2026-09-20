import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isDigestDue, reminderWasSentOnLocalDate, todayInTimeZone } from '../_shared/dates.ts'
import { formatDigestEmail } from '../_shared/digest.ts'
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
    return json({ error: 'Missing function secrets' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const log = {
    usersConsidered: 0,
    skippedWrongDay: 0,
    skippedAlreadySent: 0,
    skippedNoneOverdue: 0,
    emailsSent: 0,
    errors: [] as string[],
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, timezone, digest_day_of_week')

  if (usersError) {
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
        .select('id, name, days_overdue')
        .eq('user_id', user.id)
        .order('days_overdue', { ascending: false })

      if (overdueError) throw overdueError

      const contacts = (overdue ?? []) as OverdueRow[]
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
      for (const contact of contacts) {
        const token = await signReachOutToken(tokenSecret, {
          userId: user.id,
          contactId: contact.id,
          exp: reachOutExpiry(now.getTime()),
        })
        reachOutUrls[contact.id] = `${reachOutBase}?t=${encodeURIComponent(token)}`
      }

      const email = formatDigestEmail(contacts, reachOutUrls)
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
      console.error(JSON.stringify({ event: 'digest_user_failed', userId: user.id, message }))
    }
  }

  console.log(JSON.stringify({ event: 'digest_job_finished', ...log }))
  return json(log)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

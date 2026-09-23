import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { todayInTimeZone } from '../_shared/dates.ts'
import { addDays } from '../../../src/utils/dates.ts'
import { verifyReachOutToken } from '../_shared/token.ts'

/**
 * Email action. Knowing a contact UUID is not enough — the link carries an
 * HMAC token bound to user + contact + expiry.
 */

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  const secret = Deno.env.get('DIGEST_TOKEN_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!token || !secret || !supabaseUrl || !serviceKey) {
    console.error(JSON.stringify({ event: 'reach_out_rejected', reason: 'missing_config_or_token' }))
    return html('This link is invalid or expired.', 400)
  }

  const payload = await verifyReachOutToken(secret, token)
  if (!payload) {
    console.error(JSON.stringify({ event: 'reach_out_rejected', reason: 'invalid_token' }))
    return html('This link is invalid or expired.', 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, user_id, name, archived')
    .eq('id', payload.contactId)
    .maybeSingle()

  if (contactError || !contact || contact.user_id !== payload.userId) {
    console.error(
      JSON.stringify({
        event: 'reach_out_rejected',
        reason: 'contact_mismatch',
        userId: payload.userId,
        contactId: payload.contactId,
      }),
    )
    return html('This link is invalid or expired.', 400)
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', payload.userId)
    .maybeSingle()

  if (userError) {
    console.error(
      JSON.stringify({
        event: 'reach_out_failed',
        reason: 'user_lookup',
        userId: payload.userId,
        message: userError.message,
      }),
    )
    return html('Could not record that interaction. Try again later.', 500)
  }

  const occurredOn = todayInTimeZone(user?.timezone || 'UTC')
  const name = typeof contact.name === 'string' ? contact.name : 'them'

  if (payload.action === 'snooze') {
    const until = addDays(occurredOn, 7)
    const { error: snoozeError } = await supabase
      .from('contacts')
      .update({ snoozed_until: until })
      .eq('id', contact.id)
    if (snoozeError) {
      console.error(
        JSON.stringify({
          event: 'snooze_failed',
          userId: payload.userId,
          contactId: contact.id,
          message: snoozeError.message,
        }),
      )
      return html('Could not pause that person. Try again later.', 500)
    }
    console.log(JSON.stringify({ event: 'snooze_recorded', userId: payload.userId, contactId: contact.id, until }))
    return html(`Paused ${escapeHtml(name)} until ${until}. No conversation was logged.`)
  }

  const { error: insertError } = await supabase.from('interactions').insert({
    contact_id: contact.id,
    occurred_on: occurredOn,
    note: null,
  })

  if (insertError) {
    console.error(
      JSON.stringify({
        event: 'reach_out_failed',
        reason: 'insert',
        userId: payload.userId,
        contactId: contact.id,
        message: insertError.message,
      }),
    )
    return html('Could not record that interaction. Try again later.', 500)
  }

  console.log(
    JSON.stringify({
      event: 'reach_out_recorded',
      userId: payload.userId,
      contactId: contact.id,
      occurredOn,
    }),
  )

  return html(`Recorded: you reached out to ${escapeHtml(name)} on ${occurredOn}.`)
})

function html(message: string, status = 200) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Personal CRM</title>
  </head>
  <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
    <h1 style="font-size:1.25rem;font-weight:500">Personal CRM</h1>
    <p>${message}</p>
  </body>
</html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

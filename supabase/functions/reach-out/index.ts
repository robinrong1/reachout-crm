import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { todayInTimeZone } from '../_shared/dates.ts'
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
    return html('This link is invalid or expired.', 400)
  }

  const payload = await verifyReachOutToken(secret, token)
  if (!payload) {
    return html('This link is invalid or expired.', 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, user_id, name, archived')
    .eq('id', payload.contactId)
    .maybeSingle()

  if (contactError || !contact || contact.user_id !== payload.userId) {
    return html('This link is invalid or expired.', 400)
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', payload.userId)
    .maybeSingle()

  if (userError) {
    return html('Could not record that interaction. Try again later.', 500)
  }

  const occurredOn = todayInTimeZone(user?.timezone || 'UTC')
  const { error: insertError } = await supabase.from('interactions').insert({
    contact_id: contact.id,
    occurred_on: occurredOn,
    note: null,
  })

  if (insertError) {
    return html('Could not record that interaction. Try again later.', 500)
  }

  const name = typeof contact.name === 'string' ? contact.name : 'them'
  return html(`Recorded: you reached out to ${escapeHtml(name)} on ${occurredOn}.`)
})

function html(message: string, status = 200) {
  return new Response(
    `<!DOCTYPE html><html><body><p>${message}</p></body></html>`,
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

import type { AgentResult, GeminiContent, PendingAction, ToolEvent } from './assistantAgent'
import { formatCadence } from './cadence'
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase'
import { formatDisplayDate } from '../utils/dates'

export type { GeminiContent, PendingAction, ToolEvent }

export const DATA_CHANGED_EVENT = 'reach:data-changed'

/** Lets pages reload after the assistant changes someone. */
export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT))
}

export function onDataChanged(listener: () => void) {
  window.addEventListener(DATA_CHANGED_EVENT, listener)
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener)
}

export type AssistantRequest = {
  transcript: GeminiContent[]
  message?: string
  approval?: { approved: boolean }
}

export async function sendAssistant(request: AssistantRequest) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { data: null, error: new Error('Not signed in') }

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
  } catch {
    return {
      data: null,
      error: new Error('The assistant is not available yet. Deploy the assistant function, then try again.'),
    }
  }
  const payload = (await response.json().catch(() => ({ error: 'Unexpected response from the assistant' }))) as
    | (AgentResult & { error?: undefined })
    | { error: string }
  if (!response.ok || payload.error !== undefined) {
    return { data: null, error: new Error(payload.error ?? 'The assistant could not answer') }
  }
  return { data: payload as AgentResult, error: null }
}

export type ActionSummary = { title: string; details: string[] }

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isoDate(value: unknown) {
  const date = text(value)
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatDisplayDate(date) : date
}

function fieldDetails(args: Record<string, unknown>) {
  const details: string[] = []
  const relationship = text(args.relationship_type)
  if (relationship) details.push(`How you know them: ${relationship}`)
  if (typeof args.cadence_days === 'number') details.push(`Keep in touch: ${formatCadence(args.cadence_days)}`)
  const birthday = isoDate(args.birthday)
  if (birthday) details.push(`Birthday: ${birthday}`)
  const email = text(args.email)
  if (email) details.push(`Email: ${email}`)
  const phone = text(args.phone)
  if (phone) details.push(`Phone: ${phone}`)
  const notes = text(args.notes)
  if (notes) details.push(`Notes: ${notes}`)
  return details
}

export function describeAction(action: PendingAction): ActionSummary {
  const person = action.contactName ?? 'this person'
  if (action.name === 'create_contact') {
    const details = fieldDetails(action.args)
    if (typeof action.args.cadence_days !== 'number') details.push('Keep in touch: Monthly')
    return { title: `Add ${text(action.args.name) ?? 'someone new'}`, details }
  }
  if (action.name === 'update_contact') {
    if (action.args.archived === true) return { title: `Archive ${person}`, details: [] }
    const details = fieldDetails(action.args)
    const newName = text(action.args.name)
    if (newName && newName !== action.contactName) details.unshift(`Name: ${newName}`)
    if (action.args.archived === false) details.push('Bring back from archive')
    for (const field of ['relationship_type', 'birthday', 'email', 'phone', 'notes'] as const) {
      if (field in action.args && !text(action.args[field])) details.push(`Clear ${field.replace('_type', '').replace('_', ' ')}`)
    }
    return { title: `Update ${person}`, details }
  }
  const details = [`When: ${isoDate(action.args.occurred_on) ?? 'Today'}`]
  const note = text(action.args.note)
  if (note) details.push(`Note: ${note}`)
  return { title: `Log a conversation with ${person}`, details }
}

const WRITE_LABELS: Record<string, string> = {
  create_contact: 'Added',
  update_contact: 'Updated',
  log_interaction: 'Logged a conversation with',
}

/** Links shown under a reply for each change the assistant made. */
export function changeLinks(events: ToolEvent[], fallbackName?: string) {
  return events
    .filter((event) => event.write && event.ok && event.contactId)
    .map((event) => ({
      id: event.contactId as string,
      label: `${WRITE_LABELS[event.name] ?? 'Changed'} ${event.contactName ?? fallbackName ?? 'this person'}`,
    }))
}

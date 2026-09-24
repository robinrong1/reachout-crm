import { describe, expect, it, vi } from 'vitest'
import {
  MAX_MODEL_STEPS,
  MAX_TRANSCRIPT_CONTENTS,
  geminiTools,
  parseTranscript,
  pendingCall,
  runAgent,
  type GeminiContent,
  type ModelCaller,
  type ToolCaller,
} from './assistantAgent'

function modelSays(...turns: GeminiContent['parts'][]): ModelCaller {
  const queue = [...turns]
  return vi.fn(async () => ({ role: 'model' as const, parts: queue.shift() ?? [{ text: 'done' }] }))
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { functionCall: { name, args } }
}

const sam = { id: 'c1', name: 'Sam Lee' }

function tools(): ToolCaller {
  return vi.fn(async (name: string) => {
    if (name === 'find_contacts') return { text: JSON.stringify([sam]), isError: false }
    if (name === 'get_contact') return { text: JSON.stringify({ contact: sam }), isError: false }
    if (name === 'create_contact') return { text: JSON.stringify({ id: 'c2', name: 'Ada' }), isError: false }
    if (name === 'log_interaction') return { text: JSON.stringify({ id: 'i1', contact_id: 'c1' }), isError: false }
    return { text: 'Unknown tool', isError: true }
  })
}

describe('geminiTools', () => {
  it('declares every tool without additionalProperties anywhere', () => {
    const [{ functionDeclarations }] = geminiTools()
    expect(functionDeclarations.map((tool) => tool.name)).toContain('create_contact')
    expect(JSON.stringify(functionDeclarations)).not.toContain('additionalProperties')
  })

  it('passes optional parameters through, like the overdue never-contacted filter', () => {
    const [{ functionDeclarations }] = geminiTools()
    const overdue = functionDeclarations.find((tool) => tool.name === 'get_overdue_contacts')
    expect(overdue && 'parameters' in overdue ? overdue.parameters : null).toMatchObject({
      properties: { include_never_contacted: { type: 'boolean' } },
    })
  })
})

describe('parseTranscript', () => {
  it('accepts a missing or well-formed transcript', () => {
    expect(parseTranscript(undefined)).toEqual([])
    const turn = { role: 'user', parts: [{ text: 'hi' }] }
    expect(parseTranscript([turn])).toEqual([turn])
  })

  it('rejects bad roles, empty parts, and oversized transcripts', () => {
    expect(parseTranscript([{ role: 'system', parts: [{ text: 'x' }] }])).toBeNull()
    expect(parseTranscript([{ role: 'user', parts: [] }])).toBeNull()
    expect(parseTranscript([{ role: 'user', parts: ['text'] }])).toBeNull()
    expect(parseTranscript('nope')).toBeNull()
    const long = Array.from({ length: MAX_TRANSCRIPT_CONTENTS + 1 }, () => ({ role: 'user', parts: [{ text: 'x' }] }))
    expect(parseTranscript(long)).toBeNull()
  })
})

describe('runAgent', () => {
  it('runs read tools without asking and returns the final reply', async () => {
    const callTool = tools()
    const result = await runAgent({
      transcript: [],
      message: 'Who is Sam?',
      callModel: modelSays([call('find_contacts', { query: 'Sam' })], [{ text: 'Sam Lee is a friend.' }]),
      callTool,
    })
    expect(callTool).toHaveBeenCalledWith('find_contacts', { query: 'Sam' })
    expect(result.reply).toBe('Sam Lee is a friend.')
    expect(result.pendingAction).toBeNull()
    expect(result.toolEvents).toEqual([{ name: 'find_contacts', ok: true, write: false }])
    expect(result.transcript.map((content) => content.role)).toEqual(['user', 'model', 'user', 'model'])
  })

  it('stops at a write and does not run it', async () => {
    const callTool = tools()
    const result = await runAgent({
      transcript: [],
      message: 'Add Ada',
      callModel: modelSays([call('create_contact', { name: 'Ada' })]),
      callTool,
    })
    expect(callTool).not.toHaveBeenCalled()
    expect(result.pendingAction).toEqual({ name: 'create_contact', args: { name: 'Ada' } })
    expect(pendingCall(result.transcript)?.name).toBe('create_contact')
  })

  it('looks up the person a pending update refers to', async () => {
    const result = await runAgent({
      transcript: [],
      message: 'I talked to Sam',
      callModel: modelSays([call('log_interaction', { contact_id: 'c1' })]),
      callTool: tools(),
    })
    expect(result.pendingAction).toEqual({ name: 'log_interaction', args: { contact_id: 'c1' }, contactName: 'Sam Lee' })
  })

  it('runs an approved write and continues the conversation', async () => {
    const first = await runAgent({
      transcript: [],
      message: 'Add Ada',
      callModel: modelSays([call('create_contact', { name: 'Ada' })]),
      callTool: tools(),
    })
    const callTool = tools()
    const callModel = modelSays([{ text: 'Added Ada.' }])
    const result = await runAgent({ transcript: first.transcript, approval: { approved: true }, callModel, callTool })
    expect(callTool).toHaveBeenCalledWith('create_contact', { name: 'Ada' })
    expect(result.reply).toBe('Added Ada.')
    expect(result.toolEvents).toEqual([
      { name: 'create_contact', ok: true, write: true, contactId: 'c2', contactName: 'Ada' },
    ])
    const sent = vi.mocked(callModel).mock.calls[0][0]
    expect(sent.at(-1)?.parts[0].functionResponse?.response).toEqual({ result: { id: 'c2', name: 'Ada' } })
  })

  it('never runs a declined write and tells the model', async () => {
    const first = await runAgent({
      transcript: [],
      message: 'Add Ada',
      callModel: modelSays([call('create_contact', { name: 'Ada' })]),
      callTool: tools(),
    })
    const callTool = tools()
    const callModel = modelSays([{ text: 'Okay, I did not add her.' }])
    const result = await runAgent({ transcript: first.transcript, approval: { approved: false }, callModel, callTool })
    expect(callTool).not.toHaveBeenCalled()
    expect(result.toolEvents).toEqual([])
    const sent = vi.mocked(callModel).mock.calls[0][0]
    expect(sent.at(-1)?.parts[0].functionResponse?.response.error).toMatch(/declined/)
  })

  it('refuses a new message while a change is waiting', async () => {
    const first = await runAgent({
      transcript: [],
      message: 'Add Ada',
      callModel: modelSays([call('create_contact', { name: 'Ada' })]),
      callTool: tools(),
    })
    await expect(
      runAgent({ transcript: first.transcript, message: 'hello', callModel: modelSays(), callTool: tools() }),
    ).rejects.toThrow(/Approve or cancel/)
  })

  it('rejects an approval when nothing is waiting', async () => {
    await expect(
      runAgent({ transcript: [], approval: { approved: true }, callModel: modelSays(), callTool: tools() }),
    ).rejects.toThrow(/no change waiting/)
  })

  it('stops after the step cap', async () => {
    const callModel: ModelCaller = vi.fn(async () => ({ role: 'model' as const, parts: [call('find_contacts')] }))
    const result = await runAgent({ transcript: [], message: 'loop', callModel, callTool: tools() })
    expect(callModel).toHaveBeenCalledTimes(MAX_MODEL_STEPS)
    expect(result.reply).toMatch(/stopped/)
    expect(result.transcript.at(-1)?.role).toBe('user')
  })

  it('merges a follow-up into a trailing user turn so turns alternate', async () => {
    const capped = await runAgent({
      transcript: [],
      message: 'loop',
      callModel: vi.fn(async () => ({ role: 'model' as const, parts: [call('find_contacts')] })),
      callTool: tools(),
    })
    const callModel = modelSays([{ text: 'hi' }])
    await runAgent({ transcript: capped.transcript, message: 'again', callModel, callTool: tools() })
    const sent = vi.mocked(callModel).mock.calls[0][0]
    const roles = sent.map((content) => content.role)
    expect(roles.every((role, index) => index === 0 || role !== roles[index - 1])).toBe(true)
    expect(sent.at(-1)?.parts.at(-1)).toEqual({ text: 'again' })
  })
})
